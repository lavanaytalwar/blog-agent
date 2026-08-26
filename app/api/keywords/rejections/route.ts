import { NextResponse } from 'next/server';
import { listRejections, reject, unreject, type RejectionScope } from '../../../../lib/keywords/rejections.js';

/**
 * The rejection list — keywords a human has said no to.
 *
 * Unlike /api/keywords/mine this route writes, because it is recording a
 * decision rather than making one. What it never does is edit
 * config/keywords.json: the dashboard has no filesystem, and a committed source
 * of truth should change in a diff. `npm run keywords:rejections` carries these
 * rows into config/keyword-history.json.
 */
export async function GET() {
  return NextResponse.json({ rejections: await listRejections() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    keyword?: string; scope?: RejectionScope; primary?: string; reason?: string;
  };
  const keyword = body.keyword?.trim();
  if (!keyword) return NextResponse.json({ error: 'keyword is required.' }, { status: 400 });

  try {
    const rejection = await reject(
      keyword,
      body.scope === 'secondary' ? 'secondary' : 'primary',
      body.primary?.trim() || null,
      body.reason?.trim() || null,
    );
    return NextResponse.json({ rejection });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { keyword?: string };
  const keyword = body.keyword?.trim();
  if (!keyword) return NextResponse.json({ error: 'keyword is required.' }, { status: 400 });
  return NextResponse.json({ removed: await unreject(keyword) });
}
