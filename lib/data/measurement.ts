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

export type MeasurementRow = {
  post_id: number;
  slug: string;
  title: string;
  published_at: string | null;
  window_label: string;
  post_nonbrand_impressions: number | null;
  post_position: number | null;
  post_nonbrand_clicks: number | null;
  blogwide_nonbrand_clicks: number | null;
};

/**
 * Readings are only returned when their blog-wide control exists. A reading
 * without its control implies an attribution the data cannot support.
 *
 * Ordered by window_end, not window_label: the labels are text, and sorted as
 * text 'd7' lands after 'd56'. A date column is the thing that actually means
 * "later".
 */
export async function measurements(): Promise<MeasurementRow[]> {
  const db = sql();
  return (await db`
    select m.post_id, p.slug, p.title, p.published_at, m.window_label,
           m.post_nonbrand_impressions, m.post_position,
           m.post_nonbrand_clicks, m.blogwide_nonbrand_clicks
    from measurements m join posts p on p.id = m.post_id
    where m.blogwide_nonbrand_clicks is not null
    order by p.published_at desc, m.window_end
  `) as MeasurementRow[];
}
