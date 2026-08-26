import '../lib/env.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig } from '../lib/config/load.js';
import { analyzePage, lessonFrom, type PageAnalysis } from '../lib/serp/analyze.js';
import { topResults, searchProvider, SearchError } from '../lib/serp/search.js';

/**
 * Read the pages that currently outrank us for a keyword and record why.
 *
 * Cached to config/serp-analysis.json rather than run per draft: six fetches
 * would make every generation slow and flaky, and a SERP moves in weeks. The
 * cache carries the date it was taken so a stale read is visible.
 *
 *   npm run serp:analyze -- "<keyword>"                 # needs a search key
 *   npm run serp:analyze -- "<keyword>" <url> <url> ... # URLs supplied by hand
 */
const OUT = 'config/serp-analysis.json';
const TOP_N = 6;

type Store = {
  _source: string;
  _refresh: string;
  keywords: Record<string, {
    takenOn: string;
    source: 'search' | 'supplied' | 'sheet';
    pages: PageAnalysis[];
    lesson: ReturnType<typeof lessonFrom>;
  }>;
};

function load(): Store {
  if (existsSync(OUT)) return JSON.parse(readFileSync(OUT, 'utf8')) as Store;
  return {
    _source: 'Written by scripts/serp-analyze.ts. Measured off the live pages, never model-judged.',
    _refresh: 'npm run serp:analyze -- "<keyword>" [urls...]',
    keywords: {},
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const keyword = args[0];
  if (!keyword) {
    console.error('usage: npm run serp:analyze -- "<keyword>" [url ...]');
    process.exit(1);
  }
  const supplied = args.slice(1).filter((a) => /^https?:\/\//.test(a));

  let urls = supplied;
  let source: 'search' | 'supplied' | 'sheet' = 'supplied';

  if (!urls.length) {
    try {
      const hits = await topResults(keyword, TOP_N);
      urls = hits.map((h) => h.url);
      source = 'search';
      console.log(`search   ${searchProvider()} returned ${urls.length} results`);
    } catch (e) {
      if (!(e instanceof SearchError)) throw e;
      // Falling back to the sheet is better than doing nothing, but it is a
      // different thing from a live SERP and has to say so out loud.
      const { keywords } = loadConfig();
      const rec = keywords.keywords.find((k) => k.keyword.toLowerCase() === keyword.toLowerCase());
      urls = [...new Set([...(rec?.serp_competitors ?? []), ...(rec?.clean_room_top5 ?? [])])].slice(0, TOP_N);
      source = 'sheet';
      console.log(`${e.message}\nfalling back to the ${urls.length} URLs recorded in the keyword sheet.\n`);
    }
  }

  if (!urls.length) {
    console.error(`No URLs for "${keyword}". Pass them on the command line.`);
    process.exit(1);
  }

  const pages: PageAnalysis[] = [];
  for (const url of urls.slice(0, TOP_N)) {
    const page = await analyzePage(url);
    if (!page) {
      console.log(`  [blocked] ${new URL(url).hostname.replace(/^www\./, '')}`);
      continue;
    }
    pages.push(page);
    console.log(
      `  ${page.kind.padEnd(7)} ${String(page.words).padStart(5)}w  ${String(page.h2s.length).padStart(2)} H2  `
      + `${(page.updated ?? 'no date').padEnd(10)}  ${page.host}`,
    );
  }

  const lesson = lessonFrom(pages);
  console.log('\nwhat the SERP is rewarding:');
  for (const o of lesson.observations) console.log(`  · ${o}`);

  const store = load();
  // Stamped after the run: Date.now() inside the analyser would make two runs
  // over the same pages produce different records.
  store.keywords[keyword] = {
    takenOn: new Date().toISOString().slice(0, 10),
    source, pages, lesson,
  };
  writeFileSync(OUT, `${JSON.stringify(store, null, 2)}\n`);
  console.log(`\nwritten  ${OUT}  (${keyword}, source: ${source})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
