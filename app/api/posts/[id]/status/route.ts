import { NextResponse } from 'next/server';
import { getPost } from '../../../../../lib/data/posts.js';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    status: post.status,
    attempt: post.attempt,
    passed: post.gate_report?.passed ?? null,
  });
}
