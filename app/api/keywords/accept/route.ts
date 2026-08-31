import { NextResponse } from 'next/server';
import { listAcceptances, accept, unaccept, type AcceptanceScope } from '../../../../lib/keywords/acceptances.js';

/**
 * The accept half of the mining check, mirroring /api/keywords/rejections.
 *
 * Also writes nothing to config/keywords.json — the dashboard has no
 * filesystem. This stages a decision in the database; `npm run
 * keywords:apply-accepted` is what turns it into the committed diff.
 */
export async function GET() {
  return NextResponse.json({ acceptances: await listAcceptances() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    keyword?: string;
    scope?: AcceptanceScope;
    primary?: string;
    impressions?: number;
    clicks?: number;
    position?: number;
    firstSeen?: string;
    lastSeen?: string;
    variants?: string[];
  };
  const keyword = body.keyword?.trim();
  if (!keyword) return NextResponse.json({ error: 'keyword is required.' }, { status: 400 });

  try {
    const acceptance = await accept({
      keyword,
      scope: body.scope === 'primary' ? 'primary' : 'secondary',
      primaryKeyword: body.primary?.trim() || null,
      impressions: body.impressions ?? null,
      clicks: body.clicks ?? null,
      position: body.position ?? null,
      firstSeen: body.firstSeen ?? null,
      lastSeen: body.lastSeen ?? null,
      variants: body.variants ?? [],
    });
    return NextResponse.json({ acceptance });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { keyword?: string };
  const keyword = body.keyword?.trim();
  if (!keyword) return NextResponse.json({ error: 'keyword is required.' }, { status: 400 });
  return NextResponse.json({ removed: await unaccept(keyword) });
}
