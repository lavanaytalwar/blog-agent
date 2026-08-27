import type { CheckId } from './checks.js';

export type Verdict = 'ok' | 'weak' | 'missing';

/**
 * One judgment on one named check.
 *
 * Deliberately not `Failure` from `lib/gates/types.ts`. The two are structurally
 * identical and must never be interchangeable: a Failure stops a draft, a
 * ReviewNote cannot. Sharing the type is how the second would quietly become the
 * first.
 */
export type ReviewNote = {
  check: CheckId;
  verdict: Verdict;
  note: string;
  /** Required for weak and missing, and verified to exist in the draft. */
  quote?: string;
};

export type Review =
  | { status: 'reviewed'; model: string; notes: ReviewNote[] }
  | { status: 'unavailable'; model: string | null; reason: string };

/** The notes worth acting on. Everything else is the reviewer saying fine. */
export function weaknesses(review: Review | null): ReviewNote[] {
  if (!review || review.status !== 'reviewed') return [];
  return review.notes.filter((n) => n.verdict !== 'ok');
}
