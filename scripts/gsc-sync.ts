/**
 * Nightly Search Console pull into gsc_snapshots.
 *
 * Re-runnable: every row upserts on (date, dimension, key), so overlapping
 * windows are harmless. Defaults to the last 30 days because GSC keeps
 * revising recent days for about a week after the fact.
 */
import '../lib/env.js';
import { query } from '../lib/gsc/client.js';
import { isBranded } from '../lib/gsc/brand.js';
import { LAG_DAYS } from '../lib/gsc/lag.js';
import { sql, hasDatabase } from '../lib/db/index.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400_000));


type Snapshot = {
  date: string; dimension: 'site' | 'page' | 'query'; key: string;
  clicks: number; impressions: number; ctr: number; position: number | null;
  is_branded: boolean | null;
};

async function collect(startDate: string, endDate: string): Promise<Snapshot[]> {
  const out: Snapshot[] = [];

  const byDate = await query({ startDate, endDate, dimensions: ['date'] });
  for (const r of byDate) {
    out.push({
      date: r.keys[0]!, dimension: 'site', key: 'ALL',
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr,
      position: r.position, is_branded: null,
    });
  }

  for (const dim of ['page', 'query'] as const) {
    const rows = await query({ startDate, endDate, dimensions: ['date', dim] });
    for (const r of rows) {
      const key = r.keys[1] ?? '';
      out.push({
        date: r.keys[0]!, dimension: dim, key,
        clicks: r.clicks, impressions: r.impressions, ctr: r.ctr,
        position: r.position,
        is_branded: dim === 'query' ? isBranded(key) : null,
      });
    }
  }
  return out;
}

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const endDate = daysAgo(LAG_DAYS);
  const startDate = daysAgo(LAG_DAYS + days);

  console.log(`Pulling ${startDate} → ${endDate}`);
  const rows = await collect(startDate, endDate);
  console.log(`  ${rows.length} rows from Search Console`);

  if (!hasDatabase()) {
    const byDim = rows.reduce<Record<string, number>>((a, r) => {
      a[r.dimension] = (a[r.dimension] ?? 0) + 1; return a;
    }, {});
    console.log('  DATABASE_URL not set — dry run only.', byDim);
    return;
  }

  const db = sql();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await Promise.all(chunk.map((r) => db`
      insert into gsc_snapshots (date, dimension, key, clicks, impressions, ctr, position, is_branded)
      values (${r.date}, ${r.dimension}, ${r.key}, ${r.clicks}, ${r.impressions},
              ${r.ctr}, ${r.position}, ${r.is_branded})
      on conflict (date, dimension, key) do update set
        clicks = excluded.clicks, impressions = excluded.impressions,
        ctr = excluded.ctr, position = excluded.position, is_branded = excluded.is_branded
    `));
    process.stdout.write(`\r  upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log('\ndone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
