import { after, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sql } from '../../../../../lib/db/index.js';
import { getPost, recordDecision, MAX_ATTEMPTS } from '../../../../../lib/data/posts.js';
import { serializeDraft } from '../../../../../lib/gates/parse.js';
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

    const file = join(DRAFTS_DIR, `${post.slug}.md`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, serializeDraft({
      slug: post.slug,
      title: post.title,
      h1: post.h1 ?? post.title,
      metaDescription: post.meta_description ?? '',
      additionalKeywords: [],
      primaryKeyword: post.primary_keyword ?? '',
      clusterId: post.cluster_id,
      personaId: post.persona_id,
      bodyMd: post.body_md ?? '',
    }));

    await db`update posts set status = 'approved', approved_at = now() where id = ${postId}`;
    await recordDecision(postId, actor, 'approve');

    after(async () => {
      await notifyDiscord(
        `Draft approved — "${post.title}" · 5/5 gates passed · ${DRAFTS_DIR}/${post.slug}.md`,
      );
    });

    return NextResponse.json({ ok: true, file });
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
