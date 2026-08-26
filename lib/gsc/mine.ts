import { sql } from '../db/index.js';
import { loadConfig } from '../config/load.js';
import { fingerprint, isVariantOf } from '../keywords/fingerprint.js';
import { loadHistory, seenFingerprints } from '../keywords/history.js';
import { readFileSync, existsSync } from 'node:fs';

export type Candidate = {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  firstSeen: string;
  lastSeen: string;
};

export type SecondaryCandidate = Candidate & {
  primary: string;
  /** Other surface forms that fold to the same fingerprint. */
  variants: string[];
};

/** Striking distance: ranking but not yet winning. */
const STRIKING = { minImpressions: 10, minPosition: 11, maxPosition: 20 };

/** A secondary only needs evidence and shared intent — position barely matters. */
const SECONDARY = { minImpressions: 2 };

function noiseTerms(): string[] {
  const p = `${process.env.CONFIG_DIR ?? 'config'}/query-noise.json`;
  if (!existsSync(p)) return [];
  const doc = JSON.parse(readFileSync(p, 'utf8')) as { terms?: string[] };
  return (doc.terms ?? []).map((t) => t.toLowerCase());
}

async function nonBrandQueries(minImpressions: number): Promise<Candidate[]> {
  const db = sql();
  const rows = await db`
    select key,
           sum(impressions)::int impressions,
           sum(clicks)::int clicks,
           round(avg(position)::numeric, 1)::float position,
           min(date)::text first_seen,
           max(date)::text last_seen
    from gsc_snapshots
    where dimension = 'query' and is_branded = false
    group by key
    having sum(impressions) >= ${minImpressions}
    order by sum(impressions) desc
  `;
  const noise = noiseTerms();
  return rows
    .map((r) => ({
      query: String(r.key),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      position: Number(r.position),
      firstSeen: String(r.first_seen),
      lastSeen: String(r.last_seen),
    }))
    .filter((c) => !noise.some((n) => c.query.toLowerCase().includes(n)));
}

/**
 * Queries Helium ranks for but does not win — candidates for a new primary.
 *
 * Excludes anything already targeted and anything the history ledger has seen,
 * so a rejected candidate never comes back.
 */
export async function strikingDistance(): Promise<Candidate[]> {
  const { keywords } = loadConfig();
  const seen = seenFingerprints(loadHistory());
  const targeted = new Set(keywords.keywords.map((k) => fingerprint(k.keyword)));

  const rows = await nonBrandQueries(STRIKING.minImpressions);
  return rows.filter((c) => {
    if (c.position < STRIKING.minPosition || c.position > STRIKING.maxPosition) return false;
    const fp = fingerprint(c.query);
    return !targeted.has(fp) && !seen.has(fp);
  });
}

/**
 * Queries that are variants of an existing primary — candidates for secondaries.
 *
 * A candidate belongs to a primary when it shares at least 60% of that
 * primary's tokens without being the same target. Where a query matches more
 * than one primary, the closest wins.
 */
export async function secondaryCandidates(): Promise<SecondaryCandidate[]> {
  const { keywords } = loadConfig();
  const usable = keywords.keywords.filter((k) => k.status !== 'excluded');
  const rows = await nonBrandQueries(SECONDARY.minImpressions);

  // Fold surface forms before returning. "platform" and "platforms",
  // "personalisation" and "personalization" are one secondary, not four, and
  // without folding they would eat the whole five-term budget.
  const folded = new Map<string, SecondaryCandidate>();

  for (const c of rows) {
    const matches = usable.filter((k) => isVariantOf(c.query, k.keyword));
    if (!matches.length) continue;
    const best = matches.sort((a, b) => b.keyword.length - a.keyword.length)[0]!;

    const fp = `${best.keyword}::${fingerprint(c.query)}`;
    const existing = folded.get(fp);
    if (!existing) {
      folded.set(fp, { ...c, primary: best.keyword, variants: [] });
      continue;
    }
    // Impressions accumulate across forms; the most-searched form represents.
    const merged: SecondaryCandidate = {
      ...(c.impressions > existing.impressions ? c : existing),
      primary: best.keyword,
      impressions: existing.impressions + c.impressions,
      clicks: existing.clicks + c.clicks,
      firstSeen: existing.firstSeen < c.firstSeen ? existing.firstSeen : c.firstSeen,
      lastSeen: existing.lastSeen > c.lastSeen ? existing.lastSeen : c.lastSeen,
      variants: [...existing.variants, existing.query, c.query]
        .filter((v, i, a) => a.indexOf(v) === i)
        .filter((v) => v !== (c.impressions > existing.impressions ? c.query : existing.query)),
    };
    folded.set(fp, merged);
  }

  return [...folded.values()].sort(
    (a, b) => a.primary.localeCompare(b.primary) || b.impressions - a.impressions,
  );
}

export const thresholds = { STRIKING, SECONDARY };
