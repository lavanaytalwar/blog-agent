import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db/index.js';
import { generateForPost } from '../../../../lib/draft/run.js';
import { STALL_AFTER_MS } from '../../../../lib/data/stall.js';

export const maxDuration = 300;

/**
 * Safety net for generation orphaned by a cold start or a deploy mid-run.
 * `after()` handles the normal path; this catches what it drops.
 */
export async function GET() {
  const db = sql();
  const staleSeconds = STALL_AFTER_MS / 1000;

  // The same clock the dashboard reads, for the same reason: `created_at` does
  // not move on a regenerate, so selecting on it would pick up a post that is
  // generating right now and start a second run against the same row.
  //
  // One at a time. A generation takes longer than this function is allowed to
  // live, so a batch would start runs it is guaranteed to kill, turning the
  // recovery path into another source of the failure it exists to recover from.
  const stale = await db`
    select id from posts
    where status = 'drafted' and body_md is null
      and coalesce(generation_started_at, created_at)
          < now() - (${staleSeconds} * interval '1 second')
    order by coalesce(generation_started_at, created_at) asc
    limit 1
  `;

  for (const row of stale) await generateForPost(Number(row.id));
  return NextResponse.json({ recovered: stale.length });
}
