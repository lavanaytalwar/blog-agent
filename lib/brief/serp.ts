import { readFileSync, existsSync } from 'node:fs';
import type { SerpCoverage } from './types.js';

type Cached = { coverage: Record<string, SerpCoverage[]> };

let cache: Cached | null = null;

/**
 * What the pages that currently rank for a keyword actually cover.
 *
 * Read from a cached extraction rather than fetched live: ten HTTP requests per
 * draft would make generation slow and flaky, and the SERP moves in weeks, not
 * minutes. Refresh with `npm run serp:headings`.
 */
export function serpCoverageFor(keyword: string): SerpCoverage[] {
  if (!cache) {
    const path = `${process.env.CONFIG_DIR ?? 'config'}/serp-headings.json`;
    cache = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Cached) : { coverage: {} };
  }
  return cache.coverage[keyword] ?? [];
}

// The analysis cache moved to lib/serp/cache.ts so gate 2 can read it too.
export { serpLessonFor } from '../serp/cache.js';
