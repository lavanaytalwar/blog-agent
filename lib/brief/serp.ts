import { readFileSync, existsSync } from 'node:fs';
import type { SerpCoverage } from './types.js';
import type { PageAnalysis, SerpLesson } from '../serp/analyze.js';

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


type AnalysisStore = {
  keywords: Record<string, {
    takenOn: string;
    source: 'search' | 'supplied' | 'sheet';
    pages: PageAnalysis[];
    lesson: SerpLesson;
  }>;
};

let analysis: AnalysisStore | null = null;

/**
 * What the pages currently outranking us do, and when that was measured.
 *
 * Same reasoning as the heading cache: six fetches per draft would make every
 * generation slow and flaky. Refresh with `npm run serp:analyze`.
 */
export function serpLessonFor(keyword: string): AnalysisStore['keywords'][string] | null {
  if (!analysis) {
    const path = `${process.env.CONFIG_DIR ?? 'config'}/serp-analysis.json`;
    analysis = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as AnalysisStore)
      : { keywords: {} };
  }
  return analysis.keywords[keyword] ?? null;
}
