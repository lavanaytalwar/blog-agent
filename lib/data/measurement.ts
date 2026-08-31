// NOTE: no `server-only` guard here. These helpers are shared between server
// components and the CLI scripts in scripts/, and that package throws outside
// Next's bundler. No client component imports this module.
import { sql } from '../db/index.js';

export type DailyPoint = { date: string; clicks: number; impressions: number };

export type LeadingIndicators = {
  nonBrandQueriesWithImpressions: number;
  nonBrandClicks: number;
  nonBrandImpressions: number;
  brandedClicks: number;
  days: number;
};

const iso = (v: unknown): string => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v);
};

/** Blog-wide non-brand clicks per day. The before-picture. */
export async function nonBrandDaily(): Promise<DailyPoint[]> {
  const db = sql();
  const rows = await db`
    select date, sum(clicks)::int clicks, sum(impressions)::int impressions
    from gsc_snapshots
    where dimension = 'query' and is_branded = false
    group by date order by date asc
  `;
  return rows.map((r) => ({
    date: iso(r.date),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
  }));
}

export async function leadingIndicators(): Promise<LeadingIndicators> {
  const db = sql();
  const [totals] = await db`
    select
      count(distinct key) filter (where is_branded = false)::int as nb_queries,
      coalesce(sum(clicks) filter (where is_branded = false), 0)::int as nb_clicks,
      coalesce(sum(impressions) filter (where is_branded = false), 0)::int as nb_impressions,
      coalesce(sum(clicks) filter (where is_branded = true), 0)::int as b_clicks,
      count(distinct date)::int as days
    from gsc_snapshots where dimension = 'query'
  `;
  return {
    nonBrandQueriesWithImpressions: Number(totals?.nb_queries ?? 0),
    nonBrandClicks: Number(totals?.nb_clicks ?? 0),
    nonBrandImpressions: Number(totals?.nb_impressions ?? 0),
    brandedClicks: Number(totals?.b_clicks ?? 0),
    days: Number(totals?.days ?? 0),
  };
}
