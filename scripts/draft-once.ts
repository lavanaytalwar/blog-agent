import '../lib/env.js';
import { PipelineDraftSource } from '../lib/draft/pipeline.js';
import { serpCoverageFor } from '../lib/brief/serp.js';
import { runGates } from '../lib/gates/index.js';
import { serializeDraft } from '../lib/gates/parse.js';
import { fetchLivePosts } from './crawl-sitemap.js';
import { writeFileSync } from 'node:fs';

/**
 * One real generation, gated, written to disk. No database needed — this is the
 * cheapest way to see whether a model can actually hold the brief.
 */
async function main() {
  const keyword = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
  if (!keyword) { console.error('usage: npm run draft -- "<keyword>"'); process.exit(1); }

  const live = await fetchLivePosts();
  const source = new PipelineDraftSource(async (kw) => serpCoverageFor(kw));

  console.log(`model    ${source.name}`);
  console.log(`keyword  ${keyword}\ngenerating…\n`);

  const started = Date.now();
  const draft = await source.generate({
    primaryKeyword: keyword, clusterId: null, personaId: null, attempt: 1,
  });
  console.log(`took     ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

  const report = runGates(draft, {
    existingSlugs: live.map((p) => p.slug),
    targetedKeywords: [],
  });

  for (const r of report.results) {
    console.log(`${r.passed ? 'pass' : 'FAIL'}  ${r.gate}`);
    for (const f of r.failures) console.log(`      · ${f.rule} — ${f.message.slice(0, 110)}`);
  }

  const out = `content/drafts/_試-${draft.slug}.md`.replace('_試-', '_attempt-');
  writeFileSync(out, serializeDraft(draft));
  console.log(`\n${report.passed ? 'All five gates passed.' : `${report.failureCount} failure(s).`}`);
  console.log(`written  ${out}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
