import '../lib/env.js';
import { sql, hasDatabase } from '../lib/db/index.js';

const pad = (v: unknown, n: number) => String(v).padStart(n);
const padr = (v: unknown, n: number) => String(v).padEnd(n);
// The driver hands back Date objects for `date` columns, constructed at LOCAL
// midnight. toISOString() would shift them a day backwards in IST (UTC+5:30),
// so read the local components instead. Anything doing date arithmetic on
// measurement windows should cast to text in SQL rather than round-trip a Date.
const day = (v: unknown) => {
  if (!(v instanceof Date)) return String(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
};

async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const db = sql();

  const snap = await db`select dimension, count(*)::int n, min(date) as from_date, max(date) as to_date
                        from gsc_snapshots group by dimension order by dimension`;
  console.log('gsc_snapshots');
  for (const r of snap) console.log(`  ${padr(r.dimension, 6)} ${pad(r.n, 6)} rows   ${day(r.from_date)} → ${day(r.to_date)}`);

  const split = await db`select is_branded, sum(clicks)::int clicks, sum(impressions)::int impressions
                         from gsc_snapshots where dimension = 'query'
                         group by is_branded order by is_branded desc`;
  console.log('\nquery dimension, full history');
  for (const r of split) {
    console.log(`  ${padr(r.is_branded ? 'branded' : 'non-brand', 10)} ${pad(r.clicks, 5)} clicks  ${pad(r.impressions, 6)} impressions`);
  }

  const kw = await db`select coalesce(cluster_id,'(none)') cluster, status, count(*)::int n
                      from keywords group by cluster_id, status order by status, cluster_id`;
  console.log('\nkeywords');
  for (const r of kw) console.log(`  ${padr(r.status, 10)} ${padr(r.cluster, 24)} ${r.n}`);

  const cl = await db`select blocked, count(*)::int n from claim_ledger group by blocked order by blocked`;
  console.log('\nclaim_ledger');
  for (const r of cl) console.log(`  ${padr(r.blocked ? 'blocked' : 'usable', 10)} ${r.n}`);

  const posts = await db`select count(*)::int n from posts`;
  console.log(`\nposts        ${posts[0]?.n ?? 0}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
