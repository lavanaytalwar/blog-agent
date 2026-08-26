import { after, NextResponse } from 'next/server';
import { loadConfig } from '../../../lib/config/load.js';
import { createPost } from '../../../lib/data/posts.js';
import { generateForPost } from '../../../lib/draft/run.js';
import { slugify } from '../../../lib/draft/source.js';

export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { primaryKeyword?: string; clusterId?: string | null; personaId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const keyword = body.primaryKeyword?.trim();
  if (!keyword) {
    return NextResponse.json({ error: 'A primary keyword is required.' }, { status: 400 });
  }

  // Reject the obvious cases here so the user gets an error instead of a post
  // row that exists only to fail gate 1. The gate still runs regardless.
  const { keywords, clusters } = loadConfig();
  const record = keywords.keywords.find((k) => k.keyword.toLowerCase() === keyword.toLowerCase());
  if (record?.status === 'excluded') {
    return NextResponse.json(
      { error: `"${keyword}" is excluded: ${record.exclusion_reason ?? 'no reason recorded'}` },
      { status: 400 },
    );
  }

  const clusterId = body.clusterId ?? record?.cluster_id ?? null;
  const cluster = clusters.clusters.find((c) => c.id === clusterId);
  const personaId = body.personaId ?? cluster?.personas[0] ?? null;

  const postId = await createPost({
    primaryKeyword: keyword,
    clusterId,
    personaId,
    slug: slugify(keyword),
    title: keyword,
  });

  // Runs after the response is flushed, inside the same invocation.
  after(async () => { await generateForPost(postId); });

  return NextResponse.json({ postId });
}
