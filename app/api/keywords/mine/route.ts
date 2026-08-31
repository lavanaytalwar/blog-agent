import { NextResponse } from 'next/server';
import { strikingDistance, secondaryCandidates, thresholds } from '../../../../lib/gsc/mine.js';

export const maxDuration = 60;

/**
 * The on-demand half of "Check GSC for new keywords".
 *
 * Read-only: it reports what mining would find and writes nothing. Applying
 * candidates is the gsc-keywords skill's job, because deciding which are real
 * needs judgment this route cannot supply.
 */
export async function GET() {
  const [striking, secondaries] = await Promise.all([strikingDistance(), secondaryCandidates()]);

  const byPrimary = new Map<string, number>();
  for (const s of secondaries) byPrimary.set(s.primary, (byPrimary.get(s.primary) ?? 0) + 1);

  return NextResponse.json({
    thresholds,
    striking: striking.slice(0, 25),
    strikingCount: striking.length,
    // Returned in full so each one can be accepted or rejected from the
    // dashboard; mining has already subtracted anything previously decided.
    secondaries: secondaries.slice(0, 50).map((s) => ({
      query: s.query, primary: s.primary, impressions: s.impressions, position: s.position,
      firstSeen: s.firstSeen, lastSeen: s.lastSeen, variants: s.variants,
    })),
    secondaryCount: secondaries.length,
    primariesWithCandidates: [...byPrimary.entries()].map(([primary, count]) => ({ primary, count })),
  });
}
