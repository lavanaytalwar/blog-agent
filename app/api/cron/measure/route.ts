import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db/index.js';

export const maxDuration = 300;

const WINDOWS = [
  { label: 'd28', offset: 28 },
  { label: 'd56', offset: 56 },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Takes the +28 and +56 readings for published posts, each stored beside a
 * blog-wide control covering the identical window. Without the control a
 * reading only says the site moved, not that the post worked.
 */
export async function GET() {
  const db = sql();
  const posts = await db`
    select id, slug, published_at from posts
    where status in ('published', 'measured') and published_at is not null
  `;

  let written = 0;

  for (const post of posts) {
    const publishedAt = new Date(String(post.published_at));

    for (const w of WINDOWS) {
      const start = iso(publishedAt);
      const end = iso(new Date(publishedAt.getTime() + w.offset * 86_400_000));
      if (new Date(end) > new Date()) continue; // window has not closed yet

      const [blogwide] = await db`
        select coalesce(sum(clicks), 0)::int clicks,
               coalesce(sum(impressions), 0)::int impressions
        from gsc_snapshots
        where dimension = 'query' and is_branded = false
          and date between ${start} and ${end}
      `;
      const [own] = await db`
        select coalesce(sum(clicks), 0)::int clicks,
               coalesce(sum(impressions), 0)::int impressions
        from gsc_snapshots
        where dimension = 'page' and key like ${'%/blogs/' + String(post.slug)}
          and date between ${start} and ${end}
      `;

      await db`
        insert into measurements (post_id, window_label, window_start, window_end,
          post_clicks, post_impressions, post_nonbrand_clicks, post_nonbrand_impressions,
          blogwide_nonbrand_clicks, blogwide_nonbrand_impressions)
        values (${Number(post.id)}, ${w.label}, ${start}, ${end},
                ${own?.clicks ?? 0}, ${own?.impressions ?? 0},
                ${own?.clicks ?? 0}, ${own?.impressions ?? 0},
                ${blogwide?.clicks ?? 0}, ${blogwide?.impressions ?? 0})
        on conflict (post_id, window_label) do update set
          post_clicks = excluded.post_clicks,
          post_impressions = excluded.post_impressions,
          post_nonbrand_clicks = excluded.post_nonbrand_clicks,
          post_nonbrand_impressions = excluded.post_nonbrand_impressions,
          blogwide_nonbrand_clicks = excluded.blogwide_nonbrand_clicks,
          blogwide_nonbrand_impressions = excluded.blogwide_nonbrand_impressions,
          captured_at = now()
      `;
      written++;
    }
  }

  return NextResponse.json({ posts: posts.length, readings: written });
}
