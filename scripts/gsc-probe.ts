/**
 * Connectivity + shape check. Run this before anything else touches GSC.
 * Needs no database.
 */
import '../lib/env.js';
import { listSites, totals, query } from '../lib/gsc/client.js';
import { isBranded } from '../lib/gsc/brand.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000));

async function main() {
  const sites = await listSites();
  const entries = sites.siteEntry ?? [];
  console.log('Properties visible to this service account:');
  if (!entries.length) {
    console.log('  (none) — the service account has not been added in Search Console.');
    process.exit(1);
  }
  for (const s of entries) console.log(`  ${s.siteUrl}  [${s.permissionLevel}]`);

  // GSC lags ~2-3 days; never ask for today.
  const end = daysAgo(3);
  const start = daysAgo(30);

  const t = await totals(start, end);
  console.log(`\nLast 28 days (${start} → ${end})`);
  console.log(`  clicks ${t.clicks}  impressions ${t.impressions}  ` +
    `ctr ${(t.ctr * 100).toFixed(2)}%  avg position ${t.position.toFixed(1)}`);

  const queries = await query({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 5000 });
  let bImp = 0, bClk = 0, nImp = 0, nClk = 0;
  for (const r of queries) {
    const branded = isBranded(r.keys[0] ?? '');
    if (branded) { bImp += r.impressions; bClk += r.clicks; }
    else { nImp += r.impressions; nClk += r.clicks; }
  }
  console.log(`\n  branded    ${bImp} impressions, ${bClk} clicks`);
  console.log(`  non-brand  ${nImp} impressions, ${nClk} clicks`);
  console.log(`  → ${queries.length} distinct queries`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
