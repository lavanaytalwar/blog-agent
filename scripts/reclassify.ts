import '../lib/env.js';
import { sql, hasDatabase } from '../lib/db/index.js';
import { isBranded } from '../lib/gsc/brand.js';

/**
 * Re-runs the brand classifier over stored query rows. Needed whenever
 * lib/gsc/brand.ts changes, because is_branded is denormalised into
 * gsc_snapshots at write time.
 */
async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const db = sql();

  const keys = await db`select distinct key from gsc_snapshots where dimension = 'query'`;
  let flipped = 0;

  for (const row of keys) {
    const key = String(row.key);
    const branded = isBranded(key);
    const res = await db`
      update gsc_snapshots set is_branded = ${branded}
      where dimension = 'query' and key = ${key} and is_branded is distinct from ${branded}
      returning 1
    `;
    if (res.length) flipped += res.length;
  }

  const [after] = await db`
    select count(distinct key) filter (where is_branded = false)::int nb,
           count(distinct key) filter (where is_branded = true)::int b
    from gsc_snapshots where dimension = 'query'
  `;
  console.log(`${keys.length} distinct queries · ${flipped} row(s) reclassified`);
  console.log(`  non-brand ${after?.nb}  ·  branded ${after?.b}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
