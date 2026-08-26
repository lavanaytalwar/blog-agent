import '../lib/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { secondaryCandidates } from '../lib/gsc/mine.js';
import { loadHistory, saveHistory, record } from '../lib/keywords/history.js';
import { hasDatabase } from '../lib/db/index.js';

/**
 * Write-back half of the gsc-keywords skill.
 *
 * Takes the mined candidates and attaches up to five to each primary, with the
 * evidence that justified them. Primaries with no evidence get an empty list
 * and secondary_source "none" — never padding.
 */
const MAX_SECONDARIES = 5;
const OUT = 'config/keywords.json';

type Secondary = {
  keyword: string;
  source: 'gsc';
  impressions: number;
  position: number;
  window: string;
  variants?: string[];
};

async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);

  const doc = JSON.parse(readFileSync(OUT, 'utf8')) as {
    keywords: Record<string, unknown>[];
  };
  const candidates = await secondaryCandidates();

  const byPrimary = new Map<string, Secondary[]>();
  for (const c of candidates) {
    const list = byPrimary.get(c.primary) ?? [];
    list.push({
      keyword: c.query,
      source: 'gsc',
      impressions: c.impressions,
      position: c.position,
      window: `${c.firstSeen}..${c.lastSeen}`,
      ...(c.variants.length ? { variants: c.variants } : {}),
    });
    byPrimary.set(c.primary, list);
  }

  let history = loadHistory();
  let withEvidence = 0;

  for (const k of doc.keywords) {
    const primary = String(k.keyword);
    // Every keyword already in the sheet is, by definition, already decided.
    history = record(history, primary, 'accepted', 'in the curated sheet', 'sheet', today);

    if (k.status === 'excluded') {
      k.secondary_keywords = [];
      k.secondary_source = 'excluded';
      continue;
    }

    const found = (byPrimary.get(primary) ?? [])
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, MAX_SECONDARIES);

    k.secondary_keywords = found;
    k.secondary_source = found.length ? 'gsc' : 'none';
    if (found.length) withEvidence++;

    for (const s of found) {
      history = record(history, s.keyword, 'accepted',
        `secondary of "${primary}" · ${s.impressions} impressions`, 'gsc', today);
    }
  }

  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  saveHistory(history);

  const total = doc.keywords.filter((k) => k.status !== 'excluded').length;
  console.log(`${withEvidence} of ${total} primaries have evidence-backed secondaries.`);
  console.log(`${total - withEvidence} recorded as secondary_source "none" — not padded.`);
  console.log(`keyword history: ${history.entries.length} entries.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
