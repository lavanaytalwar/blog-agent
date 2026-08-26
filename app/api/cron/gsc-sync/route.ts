import { NextResponse } from 'next/server';
import { query } from '../../../../lib/gsc/client.js';
import { isBranded } from '../../../../lib/gsc/brand.js';
import { sql } from '../../../../lib/db/index.js';

export const maxDuration = 300;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const LAG_DAYS = 3;

/** Same job as scripts/gsc-sync.ts, on a schedule. Upserts, so re-runs are free. */
export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const endDate = daysAgo(LAG_DAYS);
  const startDate = daysAgo(LAG_DAYS + days);
  const db = sql();
  let written = 0;

  const byDate = await query({ startDate, endDate, dimensions: ['date'] });
  for (const r of byDate) {
    await db`
      insert into gsc_snapshots (date, dimension, key, clicks, impressions, ctr, position, is_branded)
      values (${r.keys[0]!}, 'site', 'ALL', ${r.clicks}, ${r.impressions}, ${r.ctr}, ${r.position}, null)
      on conflict (date, dimension, key) do update set
        clicks = excluded.clicks, impressions = excluded.impressions,
        ctr = excluded.ctr, position = excluded.position
    `;
    written++;
  }

  for (const dim of ['page', 'query'] as const) {
    const rows = await query({ startDate, endDate, dimensions: ['date', dim] });
    for (const r of rows) {
      const key = r.keys[1] ?? '';
      await db`
        insert into gsc_snapshots (date, dimension, key, clicks, impressions, ctr, position, is_branded)
        values (${r.keys[0]!}, ${dim}, ${key}, ${r.clicks}, ${r.impressions}, ${r.ctr},
                ${r.position}, ${dim === 'query' ? isBranded(key) : null})
        on conflict (date, dimension, key) do update set
          clicks = excluded.clicks, impressions = excluded.impressions,
          ctr = excluded.ctr, position = excluded.position, is_branded = excluded.is_branded
      `;
      written++;
    }
  }

  return NextResponse.json({ startDate, endDate, written });
}
