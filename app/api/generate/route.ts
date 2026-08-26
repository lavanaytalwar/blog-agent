import { after, NextResponse } from 'next/server';
import { loadConfig } from '../../../lib/config/load.js';
import { createPost } from '../../../lib/data/posts.js';
import { generateForPost } from '../../../lib/draft/run.js';
import { slugify } from '../../../lib/draft/source.js';

export const maxDuration = 300;

export async function POST(request: Request) {
  let body: {
    primaryKeyword?: string;
    additionalKeywords?: string[];
    clusterId?: string | null;
    personaId?: string | null;
  };
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

  // Additional targets, deduplicated against the lead and validated here for
  // the same reason as above: a 400 the user can read beats a post row that
  // exists only to fail a gate.
  const seen = new Set([keyword.toLowerCase()]);
  const additionalKeywords: string[] = [];
  for (const raw of body.additionalKeywords ?? []) {
    const extra = String(raw).trim();
    if (!extra || seen.has(extra.toLowerCase())) continue;
    seen.add(extra.toLowerCase());

    const found = keywords.keywords.find((k) => k.keyword.toLowerCase() === extra.toLowerCase());
    if (!found) {
      return NextResponse.json({ error: `"${extra}" is not in the keyword list.` }, { status: 400 });
    }
    if (found.status === 'excluded') {
      return NextResponse.json(
        { error: `"${extra}" is excluded: ${found.exclusion_reason ?? 'no reason recorded'}` },
        { status: 400 },
      );
    }
    if (clusterId && found.cluster_id !== clusterId) {
      return NextResponse.json(
        { error: `"${extra}" is in cluster "${found.cluster_id}", not "${clusterId}". One post covers one cluster — generate these separately.` },
        { status: 400 },
      );
    }
    additionalKeywords.push(found.keyword);
  }

  const postId = await createPost({
    primaryKeyword: keyword,
    additionalKeywords,
    clusterId,
    personaId,
    slug: slugify(keyword),
    title: keyword,
  });

  // Runs after the response is flushed, inside the same invocation.
  after(async () => { await generateForPost(postId); });

  return NextResponse.json({ postId });
}
