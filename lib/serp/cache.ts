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
