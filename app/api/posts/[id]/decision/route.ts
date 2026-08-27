import { after, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sql } from '../../../../../lib/db/index.js';
import { getPost, recordDecision, draftMarkdown, MAX_ATTEMPTS } from '../../../../../lib/data/posts.js';
import { generateForPost } from '../../../../../lib/draft/run.js';
import { notifyDiscord } from '../../../../../lib/notify/discord.js';

export const maxDuration = 300;

const DRAFTS_DIR = process.env.DRAFTS_DIR ?? 'content/drafts';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);

  const body = (await request.json().catch(() => null)) as
    | { action?: string; note?: string; actor?: string }
    | null;

  const action = body?.action;
  const actor = body?.actor?.trim();
  if (!actor) return NextResponse.json({ error: 'An actor is required.' }, { status: 400 });
  if (action !== 'approve' && action !== 'discard' && action !== 'regenerate') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const post = await getPost(postId);
  if (!post) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const db = sql();

  if (action === 'approve') {
    // The server enforces this, not just the button. A disabled button is a
    // hint; this is the rule.
    if (!post.gate_report?.passed) {
      return NextResponse.json(
        { error: 'Approve is unavailable while a gate fails. Change the config and regenerate.' },
        { status: 409 },
      );
    }

    // Approval is recorded first. The markdown is derivable from the row at any
    // time via /api/posts/[id]/markdown, so a filesystem that will not take the
    // file must not be able to block the decision.
    await db`update posts set status = 'approved', approved_at = now() where id = ${postId}`;
    await recordDecision(postId, actor, 'approve');

    // Best effort, and only useful locally: Vercel serverless is read-only
    // outside /tmp. Writing here is a convenience for local runs, never the
    // delivery mechanism. `download` is.
    const file = join(DRAFTS_DIR, `${post.slug}.md`);
    let written: string | null = null;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, draftMarkdown(post));
      written = file;
    } catch {
      written = null;
    }

    const download = `/api/posts/${postId}/markdown`;
    after(async () => {
      await notifyDiscord(
        `Draft approved: "${post.title}" · 5/5 gates passed · ${written ?? download}`,
      );
    });

    return NextResponse.json({ ok: true, file: written, download });
  }

  if (action === 'discard') {
    await db`update posts set status = 'discarded' where id = ${postId}`;
    await recordDecision(postId, actor, 'discard', body?.note);
    return NextResponse.json({ ok: true });
  }

  if (post.attempt >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: `Both attempts are used. Approve, discard, or fix the brief and start fresh.` },
      { status: 409 },
    );
  }
  if (!body?.note?.trim()) {
    return NextResponse.json({ error: 'A regenerate needs a note.' }, { status: 400 });
  }

  await db`update posts set attempt = attempt + 1, status = 'drafted', body_md = null where id = ${postId}`;
  await recordDecision(postId, actor, 'regenerate', body.note);
  after(async () => { await generateForPost(postId, body.note); });

  return NextResponse.json({ ok: true });
}
