import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db/index.js';
import { windowHasClosed } from '../../../../lib/gsc/lag.js';

export const maxDuration = 300;

/**
 * Four windows, not two. The +28 and +56 readings are the verdict; +7 and +14
 * exist so the verdict is not the first thing anyone learns.
 *
 * A post that is going to work at all shows impressions inside a fortnight.
 * One that is not indexed shows nothing, and the two are worth telling apart
 * three weeks before the +28 reading lands.
 */
const WINDOWS = [
  { label: 'd7', offset: 7 },
  { label: 'd14', offset: 14 },
  { label: 'd28', offset: 28 },
  { label: 'd56', offset: 56 },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Takes each reading for published posts, stored beside a blog-wide control
 * covering the identical window. Without the control a reading only says the
 * site moved, not that the post worked.
 */
export async function GET() {
  const db = sql();
  const posts = await db`
    select id, slug, published_at from posts
    where status in ('published', 'measured') and published_at is not null
  `;

  let written = 0;
  let held = 0;

  for (const post of posts) {
    const publishedAt = new Date(String(post.published_at));

    for (const w of WINDOWS) {
      const start = iso(publishedAt);
      const end = iso(new Date(publishedAt.getTime() + w.offset * 86_400_000));

      // Held until Search Console has reported through the window's last day,
      // not merely until that day has passed. Reading a window through the
      // three-day reporting lag understates it, and on a +7 window that is
      // nearly half the reading.
      if (!windowHasClosed(end)) {
        held++;
        continue;
      }

      const [blogwide] = await db`
        select coalesce(sum(clicks), 0)::int clicks,
               coalesce(sum(impressions), 0)::int impressions
        from gsc_snapshots
        where dimension = 'query' and is_branded = false
          and date between ${start} and ${end}
      `;

      // Position is impression-weighted, not a mean of the daily averages: a
      // day with two impressions must not count as much as a day with two
      // hundred. This is the number that separates "ranking deep" from "not
      // ranking", which no click count can.
      const [own] = await db`
        select coalesce(sum(clicks), 0)::int clicks,
               coalesce(sum(impressions), 0)::int impressions,
               (sum(position * impressions) / nullif(sum(impressions), 0))::float position
        from gsc_snapshots
        where dimension = 'page' and key like ${'%/blogs/' + String(post.slug)}
          and date between ${start} and ${end}
      `;

      await db`
        insert into measurements (post_id, window_label, window_start, window_end,
          post_clicks, post_impressions, post_position,
          post_nonbrand_clicks, post_nonbrand_impressions,
          blogwide_nonbrand_clicks, blogwide_nonbrand_impressions)
        values (${Number(post.id)}, ${w.label}, ${start}, ${end},
                ${own?.clicks ?? 0}, ${own?.impressions ?? 0}, ${own?.position ?? null},
                ${own?.clicks ?? 0}, ${own?.impressions ?? 0},
                ${blogwide?.clicks ?? 0}, ${blogwide?.impressions ?? 0})
        on conflict (post_id, window_label) do update set
          post_clicks = excluded.post_clicks,
          post_impressions = excluded.post_impressions,
          post_position = excluded.post_position,
          post_nonbrand_clicks = excluded.post_nonbrand_clicks,
          post_nonbrand_impressions = excluded.post_nonbrand_impressions,
          blogwide_nonbrand_clicks = excluded.blogwide_nonbrand_clicks,
          blogwide_nonbrand_impressions = excluded.blogwide_nonbrand_impressions,
          captured_at = now()
      `;
      written++;
    }
  }

  return NextResponse.json({ posts: posts.length, readings: written, held });
}
