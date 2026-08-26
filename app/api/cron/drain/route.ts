import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db/index.js';
import { generateForPost } from '../../../../lib/draft/run.js';

export const maxDuration = 300;

/**
 * Safety net for generation orphaned by a cold start or a deploy mid-run.
 * `after()` handles the normal path; this catches what it drops.
 */
export async function GET() {
  const db = sql();
  const stale = await db`
    select id from posts
    where status = 'drafted' and body_md is null
      and created_at < now() - interval '10 minutes'
    limit 5
  `;

  for (const row of stale) await generateForPost(Number(row.id));
  return NextResponse.json({ recovered: stale.length });
}
