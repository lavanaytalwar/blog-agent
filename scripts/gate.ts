import '../lib/env.js';
import { readFile } from 'node:fs/promises';
import { runGates } from '../lib/gates/index.js';
import { parseDraft } from '../lib/gates/parse.js';
import { fetchLivePosts } from './crawl-sitemap.js';

const RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npm run gate -- <draft.md> [--offline]');
    process.exit(1);
  }

  const draft = parseDraft(await readFile(path, 'utf8'));

  // Gate 4 needs to know what already exists. Offline mode skips the live
  // fetch, which is fine for iterating on wording but not for a real decision.
  let existingSlugs: string[] = [];
  if (!process.argv.includes('--offline')) {
    existingSlugs = (await fetchLivePosts()).map((p) => p.slug);
  } else {
    console.log(`${DIM}offline: skipping the live slug check${RESET}\n`);
  }

  const report = runGates(draft, { existingSlugs, targetedKeywords: [] });

  for (const r of report.results) {
    const mark = r.passed ? `${GREEN}pass${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${mark}  ${r.gate}`);
    for (const f of r.failures) {
      console.log(`      ${RED}·${RESET} ${f.rule} — ${f.message}`);
      if (f.evidence) console.log(`        ${DIM}${f.evidence.slice(0, 100)}${RESET}`);
    }
  }

  console.log(
    report.passed
      ? `\n${GREEN}All five gates passed.${RESET}`
      : `\n${RED}${report.failureCount} failure(s).${RESET}`,
  );
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(2); });
