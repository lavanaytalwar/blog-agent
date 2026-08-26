import '../lib/env.js';
import { hasDatabase } from '../lib/db/index.js';
import { listRejections } from '../lib/keywords/rejections.js';
import { loadHistory, saveHistory, record } from '../lib/keywords/history.js';

/**
 * Carries dashboard rejections into config/keyword-history.json.
 *
 * The table is the live list mining reads; the JSON is the committed memory
 * that survives the database. Running this makes a rejection show up in a diff,
 * which is the point of keeping the ledger in git at all.
 */
async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }

  const rejections = await listRejections();
  if (!rejections.length) {
    console.log('No rejections recorded. Nothing to sync.');
    return;
  }

  const history = loadHistory();
  const before = new Set(history.entries.filter((e) => e.verdict === 'rejected').map((e) => e.fingerprint));
  let added = 0;

  for (const r of rejections) {
    const reason = r.reason
      ?? (r.primaryKeyword ? `Rejected on the dashboard (secondary of "${r.primaryKeyword}").` : 'Rejected on the dashboard.');
    if (!before.has(r.fingerprint)) added++;
    record(history, r.keyword, 'rejected', reason, `dashboard:${r.scope}`, r.rejectedAt.slice(0, 10));
  }

  saveHistory(history);
  console.log(`${rejections.length} rejection(s) synced — ${added} new, ${rejections.length - added} already in the ledger.`);
  console.log('config/keyword-history.json updated. Commit it.');
}

main().catch((e) => { console.error(e); process.exit(1); });
