import { NextResponse } from 'next/server';
import { getPost, draftMarkdown } from '../../../../../lib/data/posts.js';

/**
 * The approved post, as a file a reviewer can save.
 *
 * This is the durable delivery path, not the file the approve handler writes.
 * Vercel serverless runs on a read-only filesystem outside /tmp, so a post
 * approved in production has no file on disk to collect. The body has always
 * been in Postgres; this just serves it in the shape the CMS wants.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return new NextResponse(draftMarkdown(post), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': contentDisposition(`${post.slug}.md`),
    },
  });
}

/**
 * RFC 5987, because a slug is not guaranteed to be ASCII.
 *
 * HTTP header values are ByteStrings, so a single curly apostrophe throws
 * rather than downloading. Three posts live on the site have exactly that in
 * their slugs, and gate 2's `slug.ascii` only stops the fourth: it cannot fix
 * rows that already exist. Older browsers read the plain `filename`, everything
 * current prefers `filename*`.
 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '-').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
