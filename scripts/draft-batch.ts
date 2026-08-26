import '../lib/env.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PipelineDraftSource } from '../lib/draft/pipeline.js';
import { serpCoverageFor } from '../lib/brief/serp.js';
import { runGates } from '../lib/gates/index.js';
import { serializeDraft } from '../lib/gates/parse.js';
import { fetchLivePosts } from './crawl-sitemap.js';
import { bodyProse, sentences, wordCount, containsPhrase } from '../lib/gates/text.js';
import { loadConfig } from '../lib/config/load.js';

/**
 * Runs the pipeline over several keywords and reports which rules fail and how
 * often. One draft tells you whether the plumbing works; five tell you which
 * instructions the model actually ignores.
 */
const KEYWORDS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = 'content/drafts/_batch';

type Row = {
  keyword: string;
  cluster: string | null;
  ok: boolean;
  seconds: number;
  failures: string[];
  words: number;
  longSentenceShare: number;
  primaryUses: number;
  secondaryUses: number;
  error?: string;
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const live = await fetchLivePosts();
  const source = new PipelineDraftSource(async (kw) => serpCoverageFor(kw));
  const { keywords } = loadConfig();
  const rows: Row[] = [];

  for (const keyword of KEYWORDS) {
    const started = Date.now();
    process.stdout.write(`${keyword} … `);
    const record = keywords.keywords.find((k) => k.keyword.toLowerCase() === keyword.toLowerCase());

    try {
      const draft = await source.generate({
        primaryKeyword: keyword, clusterId: null, personaId: null, attempt: 1,
      });
      const report = runGates(draft, { existingSlugs: live.map((p) => p.slug), targetedKeywords: [] });
      const prose = bodyProse(draft.bodyMd);
      const all = sentences(prose);
      const long = all.filter((s) => wordCount(s) > 15).length;

      const searchable = [draft.title, draft.h1, draft.metaDescription, prose].join('\n');
      const countOf = (term: string) =>
        (searchable.toLowerCase().match(new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;

      rows.push({
        keyword,
        cluster: draft.clusterId,
        ok: report.passed,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        failures: report.results.flatMap((r) => r.failures.map((f) => f.rule)),
        words: wordCount(prose),
        longSentenceShare: all.length ? Number((long / all.length).toFixed(2)) : 0,
        primaryUses: countOf(draft.primaryKeyword),
        secondaryUses: (record?.secondary_keywords ?? []).reduce((n, s) => n + countOf(s.keyword), 0),
      });
      writeFileSync(`${OUT}/${draft.slug}.md`, serializeDraft(draft));
      console.log(report.passed ? 'pass' : `FAIL (${report.failureCount})`);
    } catch (e) {
      rows.push({
        keyword, cluster: null, ok: false, seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        failures: ['generation.error'], words: 0, longSentenceShare: 0,
        primaryUses: 0, secondaryUses: 0,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      });
      console.log('ERROR');
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${rows.filter((r) => r.ok).length}/${rows.length} passed all five gates\n`);

  console.log('keyword'.padEnd(38) + 'ok    s   words  long%  kw  2nd  failures');
  for (const r of rows) {
    console.log(
      r.keyword.slice(0, 36).padEnd(38) +
      (r.ok ? 'yes' : 'NO ').padEnd(6) +
      String(r.seconds).padStart(4) + '  ' +
      String(r.words).padStart(5) + '  ' +
      String(Math.round(r.longSentenceShare * 100)).padStart(4) + '%  ' +
      String(r.primaryUses).padStart(2) + '  ' +
      String(r.secondaryUses).padStart(3) + '  ' +
      r.failures.join(', '),
    );
  }

  const tally = new Map<string, number>();
  for (const r of rows) for (const f of r.failures) tally.set(f, (tally.get(f) ?? 0) + 1);
  if (tally.size) {
    console.log('\nfailures by rule:');
    for (const [rule, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(2)}/${rows.length}  ${rule}`);
    }
  }
  writeFileSync(`${OUT}/_results.json`, JSON.stringify(rows, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
