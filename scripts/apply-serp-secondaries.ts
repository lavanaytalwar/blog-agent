import '../lib/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHistory, saveHistory, record, seenFingerprints } from '../lib/keywords/history.js';
import { fingerprint } from '../lib/keywords/fingerprint.js';

/**
 * Applies tier-2 (SERP heading) secondaries curated by the gsc-keywords skill.
 *
 * Only writes primaries that are currently `none` — a primary with Search
 * Console evidence keeps it, because tier 1 outranks tier 2.
 *
 * Refuses any term whose fingerprint is already spoken for. A secondary that
 * belongs to two primaries is internal cannibalization, which is the thing the
 * history ledger exists to prevent.
 */
const OUT = 'config/keywords.json';
const MAX = 5;

type Decision = { keyword: string; evidence: string };

async function main() {
  const path = process.argv[2];
  const tier = (process.argv[3] ?? 'serp') as 'serp' | 'proposed';
  if (!path) {
    console.error('usage: tsx scripts/apply-serp-secondaries.ts <decisions.json> [serp|proposed]');
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const decisions = (JSON.parse(readFileSync(path, 'utf8')) as {
    decisions: Record<string, Decision[]>;
  }).decisions;

  const doc = JSON.parse(readFileSync(OUT, 'utf8')) as { keywords: Record<string, unknown>[] };
  let history = loadHistory();
  const taken = seenFingerprints(history);

  let applied = 0, skippedTier1 = 0, collisions = 0;

  for (const k of doc.keywords) {
    const primary = String(k.keyword);
    const proposed = decisions[primary];
    if (!proposed) continue;

    if (k.secondary_source && k.secondary_source !== 'none') {
      skippedTier1++;
      continue;
    }

    const kept: Record<string, unknown>[] = [];
    for (const d of proposed) {
      const fp = fingerprint(d.keyword);
      if (taken.has(fp)) {
        collisions++;
        history = record(history, d.keyword, 'rejected',
          `fingerprint already spoken for; a secondary cannot belong to two primaries`, tier, today);
        continue;
      }
      taken.add(fp);
      kept.push({ keyword: d.keyword, source: tier, evidence: d.evidence, window: today });
      // A proposed term is awaiting a human decision, so it is recorded as
      // proposed rather than accepted — the history has to stay honest too.
      history = record(history, d.keyword, tier === 'proposed' ? 'proposed' : 'accepted',
        `secondary of "${primary}" · ${d.evidence.split(' — ')[0]}`, tier, today);
      if (kept.length >= MAX) break;
    }

    if (kept.length) {
      k.secondary_keywords = kept;
      k.secondary_source = tier;
      applied++;
    }
  }

  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  saveHistory(history);

  console.log(`${applied} primaries gained ${tier}-backed secondaries`);
  console.log(`${skippedTier1} skipped — already have Search Console evidence (tier 1 wins)`);
  console.log(`${collisions} terms rejected as fingerprint collisions`);
}

main().catch((e) => { console.error(e); process.exit(1); });
