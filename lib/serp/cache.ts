import { readFileSync, existsSync } from 'node:fs';
import type { PageAnalysis, SerpLesson } from './analyze.js';

/**
 * The cached SERP reading, shared by the brief and by gate 2.
 *
 * It lives here rather than under `brief/` because the length gate reads it
 * too, and a gate importing from the brief layer would be backwards.
 *
 * This is a committed file, not a live fetch. That distinction is what makes it
 * safe for a gate to depend on: `config/serp-analysis.json` is data at rest in
 * exactly the way `keywords.json` and `claim-ledger.json` are, so the same
 * config always produces the same verdict. A gate that called out to a search
 * API would be a different thing entirely and would not belong here.
 */
export type SerpReading = {
  takenOn: string;
  source: 'search' | 'supplied' | 'sheet';
  pages: PageAnalysis[];
  lesson: SerpLesson;
};

type Store = { keywords: Record<string, SerpReading> };

let cache: Store | null = null;

export function serpLessonFor(keyword: string): SerpReading | null {
  if (!cache) {
    const path = `${process.env.CONFIG_DIR ?? 'config'}/serp-analysis.json`;
    cache = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Store) : { keywords: {} };
  }
  return cache.keywords[keyword] ?? null;
}

/** Tests mutate the cache file; this lets them re-read it. */
export function resetSerpCache(): void {
  cache = null;
}

/**
 * Characters of prose the draft must clear, and must not wildly exceed.
 *
 * Derived from the pages that actually hold the positions rather than from a
 * number someone picked. A post at 70% of the median can still win on angle; a
 * post at 30% of it is not competing. The ceiling is generous because length is
 * not the enemy, padding is, and 2x the median is padding.
 */
export const ABSOLUTE_MIN_CHARS = 3_000;
export const CHARS_PER_ADDITIONAL_TARGET = 1_500;
const FLOOR_SHARE = 0.7;
const CEILING_MULTIPLE = 2;

export function lengthBoundsFor(
  keyword: string,
  additionalTargets: number,
): { min: number; max: number | null; from: 'serp' | 'default'; median?: number } {
  const bump = additionalTargets * CHARS_PER_ADDITIONAL_TARGET;
  const median = serpLessonFor(keyword)?.lesson.medianChars ?? 0;

  if (!median) return { min: ABSOLUTE_MIN_CHARS + bump, max: null, from: 'default' };

  return {
    min: Math.max(ABSOLUTE_MIN_CHARS, Math.round(median * FLOOR_SHARE)) + bump,
    max: Math.round(median * CEILING_MULTIPLE) + bump,
    from: 'serp',
    median,
  };
}
