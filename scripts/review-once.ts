import '../lib/env.js';
import { readFile } from 'node:fs/promises';
import { parseDraft } from '../lib/gates/parse.js';
import { reviewDraft } from '../lib/review/run.js';
import { CHECK_IDS } from '../lib/review/checks.js';

const RESET = '\x1b[0m', DIM = '\x1b[2m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m';

/**
 * Runs the advisory review over a saved draft file, the way `npm run gate`
 * runs the gates over one.
 *
 * Exits 0 whatever it finds. This pass cannot fail a draft in the pipeline, so
 * a script that failed the shell would be teaching the wrong thing about it.
 */
async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npm run review -- <draft.md>');
    process.exit(1);
  }

  const draft = parseDraft(await readFile(path, 'utf8'));
  const review = await reviewDraft(draft);

  if (review.status === 'unavailable') {
    console.log(`${YELLOW}review unavailable${RESET}  ${review.reason}`);
    return;
  }

  const byCheck = new Map(review.notes.map((n) => [n.check, n]));
  for (const id of CHECK_IDS) {
    const note = byCheck.get(id);
    if (!note) {
      console.log(`${DIM}  ..  ${id}  not reported${RESET}`);
      continue;
    }
    const mark = note.verdict === 'ok' ? `${GREEN}  ok${RESET}` : `${YELLOW}${note.verdict.padStart(4)}${RESET}`;
    console.log(`${mark}  ${id}`);
    console.log(`      ${note.note}`);
    if (note.quote) console.log(`      ${DIM}"${note.quote.slice(0, 110)}"${RESET}`);
  }

  const weak = review.notes.filter((n) => n.verdict !== 'ok').length;
  console.log(`\n${DIM}${review.model}${RESET}  ${weak} of ${review.notes.length} flagged, advisory only.`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(2); });
