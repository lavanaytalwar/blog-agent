import { NextResponse } from 'next/server';
import { getPost } from '../../../../../lib/data/posts.js';
import { generationState } from '../../../../../lib/data/stall.js';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The poller cannot work out on its own that a run has died: a stalled row and
  // a healthy in-progress row are the same row. The server decides, here.
  const generation = generationState(post);

  return NextResponse.json({
    status: post.status,
    attempt: post.attempt,
    passed: post.gate_report?.passed ?? null,
    generation: generation.state,
    startedAt: generation.state === 'idle' ? null : generation.startedAt,
  });
}
