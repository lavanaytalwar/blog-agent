import '../lib/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { hasDatabase, sql } from '../lib/db/index.js';
import { listAcceptances } from '../lib/keywords/acceptances.js';
import { loadHistory, saveHistory, record, seenFingerprints } from '../lib/keywords/history.js';
import { fingerprint } from '../lib/keywords/fingerprint.js';

/**
 * Folds candidates accepted from the dashboard's mining check into
 * config/keywords.json — the write-back half of the "select" step, so
 * targeting still changes as one committed diff rather than from a button.
 *
 * A secondary is added to its primary's existing list (not a wholesale
 * replace, unlike apply-secondaries.ts, because this runs against whatever a
 * human picked one at a time, not a fresh full mining pass). A primary lands
 * with cluster_id null and status 'unmapped', same as a brand-new row from
 * ingest-keywords.ts — gate 1 already refuses to generate against it until a
 * human assigns a cluster in config/clusters.json.
 *
 * Applied rows are deleted from keyword_acceptances once written, so this is
 * idempotent to re-run and the database never disagrees with the file about
 * what is still "staged, not yet applied".
 */
const OUT = 'config/keywords.json';
const MAX_SECONDARIES = 5;

async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }

  const accepted = await listAcceptances();
  if (!accepted.length) { console.log('Nothing staged. Accept a candidate from /keywords first.'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const doc = JSON.parse(readFileSync(OUT, 'utf8')) as { keywords: Record<string, unknown>[] };
  let history = loadHistory();
  const taken = seenFingerprints(history);

  const byKeyword = new Map(doc.keywords.map((k) => [String(k.keyword).toLowerCase(), k]));

  let newPrimaries = 0, newSecondaries = 0, skipped = 0;
  const applied: string[] = [];

  for (const a of accepted) {
    if (a.scope === 'primary') {
      if (byKeyword.has(a.keyword.toLowerCase())) {
        console.warn(`  ! "${a.keyword}" is already in the list — dropping the stale acceptance.`);
        applied.push(a.fingerprint);
        continue;
      }
      const entry: Record<string, unknown> = {
        keyword: a.keyword, cluster_id: null, status: 'unmapped',
        outline: null, serp_competitors: [], clean_room_top5: [], push_target: null,
        source: 'gsc:striking-distance',
        note: `${a.impressions ?? '?'} imp, avg pos ${a.position ?? '?'} — needs a cluster before it can be generated.`,
      };
      doc.keywords.push(entry);
      byKeyword.set(a.keyword.toLowerCase(), entry);
      taken.add(a.fingerprint);
      history = record(history, a.keyword, 'accepted',
        `striking distance · ${a.impressions ?? '?'} impressions, avg position ${a.position ?? '?'}`,
        'gsc', today);
      newPrimaries++;
      applied.push(a.fingerprint);
      continue;
    }

    // Secondary.
    const primary = a.primaryKeyword ? byKeyword.get(a.primaryKeyword.toLowerCase()) : null;
    if (!primary) {
      console.warn(`  ! "${a.keyword}" was accepted as a secondary of "${a.primaryKeyword}", which is no longer in the list — skipping.`);
      skipped++;
      continue;
    }
    const existing = (primary.secondary_keywords as Record<string, unknown>[] | undefined) ?? [];
    const onThisPrimary = existing.some((s) => fingerprint(String(s.keyword)) === a.fingerprint);

    if (onThisPrimary) {
      applied.push(a.fingerprint); // Already there — clear the stale acceptance and move on.
      continue;
    }
    if (taken.has(a.fingerprint)) {
      console.warn(`  ! "${a.keyword}" already belongs to another primary — skipping to avoid cannibalization.`);
      history = record(history, a.keyword, 'rejected',
        'fingerprint already spoken for; a secondary cannot belong to two primaries', 'gsc', today);
      applied.push(a.fingerprint);
      skipped++;
      continue;
    }
    if (existing.length >= MAX_SECONDARIES) {
      console.warn(`  ! "${primary.keyword}" already has ${MAX_SECONDARIES} secondaries — "${a.keyword}" left staged.`);
      continue;
    }

    existing.push({
      keyword: a.keyword, source: 'gsc',
      impressions: a.impressions ?? undefined, position: a.position ?? undefined,
      window: `${a.firstSeen ?? today}..${a.lastSeen ?? today}`,
      ...(a.variants.length ? { variants: a.variants } : {}),
    });
    primary.secondary_keywords = existing;
    primary.secondary_source = 'gsc';
    taken.add(a.fingerprint);
    history = record(history, a.keyword, 'accepted',
      `secondary of "${primary.keyword}" · ${a.impressions ?? '?'} impressions`, 'gsc', today);
    newSecondaries++;
    applied.push(a.fingerprint);
  }

  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  saveHistory(history);

  if (applied.length) {
    const db = sql();
    for (const fp of applied) await db`delete from keyword_acceptances where fingerprint = ${fp}`;
  }

  console.log(`${newPrimaries} new primary keyword(s) added (status 'unmapped' — assign a cluster before targeting).`);
  console.log(`${newSecondaries} new secondary keyword(s) attached to existing primaries.`);
  if (skipped) console.log(`${skipped} skipped — see warnings above.`);
  console.log(`\n${OUT} and config/keyword-history.json updated. Review the diff, then commit.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
