import { assembleBrief } from '../brief/assemble.js';
import { serpCoverageFor } from '../brief/serp.js';
import { getProvider } from '../llm/index.js';
import { CHECKS, CHECK_IDS, MIN_REPORTED, type CheckId } from './checks.js';
import { renderReviewPrompt, renderReviewMessage } from './prompt.js';
import type { Review, ReviewNote, Verdict } from './types.js';
import type { Draft } from '../gates/types.js';

export class ReviewParseError extends Error {}

const VERDICTS: Verdict[] = ['ok', 'weak', 'missing'];

/** Shortest quote that can prove anything. Below this it is a fragment. */
const MIN_QUOTE = 10;

/**
 * Reads a draft for the nine things a gate cannot check.
 *
 * Advisory by construction. It returns notes and never a verdict on the post,
 * it is called after the gates have already decided the status, and nothing in
 * `lib/gates` can import it. A test asserts the last part, because that is the
 * property that stops this from becoming a model judging a model.
 *
 * Never throws. A reviewer that fails is a review that is unavailable, which is
 * recorded and shown; it is not a draft that fails.
 */
export async function reviewDraft(draft: Draft): Promise<Review> {
  let model: string | null = null;
  try {
    const brief = assembleBrief({
      primaryKeyword: draft.primaryKeyword,
      additionalKeywords: draft.additionalKeywords,
      personaId: draft.personaId,
      serpCoverage: serpCoverageFor(draft.primaryKeyword),
    });

    const provider = getProvider();
    model = `${provider.name}:${provider.model}`;

    const result = await provider.complete({
      system: renderReviewPrompt(brief),
      messages: [{ role: 'user', content: renderReviewMessage(draft) }],
      // Zero. The draft is where the prose belongs; a reviewer that phrases its
      // findings differently on each run is impossible to act on.
      temperature: 0,
      maxTokens: 2000,
    });

    return { status: 'reviewed', model, notes: parseReview(result.text, draft.bodyMd) };
  } catch (error) {
    return {
      status: 'unavailable',
      model,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Whitespace collapsed, smart punctuation folded, lowercased.
 *
 * A quote has to be the reviewer's own sentence from the draft, but failing a
 * real finding because the model straightened an apostrophe would just teach it
 * to stop quoting.
 */
function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Strict parse. Every rule here costs the reviewer a finding rather than
 * costing the draft anything.
 *
 * Model reviewers default to praise and, when pushed for criticism, to
 * confident invention. The counter is that criticism has to be evidenced: a
 * weak or missing verdict with no quote, or with a quote that is not in the
 * draft, is discarded. Nothing here can promote a note into a failure.
 */
export function parseReview(text: string, bodyMd: string): ReviewNote[] {
  const raw = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReviewParseError(`Reviewer did not return JSON: ${text.slice(0, 200)}`);
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : (parsed as { notes?: unknown[] })?.notes;
  if (!Array.isArray(entries)) {
    throw new ReviewParseError('Reviewer returned no notes array.');
  }

  const body = normalize(bodyMd);
  const seen = new Set<CheckId>();
  const notes: ReviewNote[] = [];

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const check = String(e.check ?? '') as CheckId;
    if (!(check in CHECKS) || seen.has(check)) continue;

    const verdict = String(e.verdict ?? '') as Verdict;
    if (!VERDICTS.includes(verdict)) continue;

    const note = String(e.note ?? '').trim();
    if (!note) continue;

    const quote = typeof e.quote === 'string' ? e.quote.trim() : '';
    const supported = quote.length >= MIN_QUOTE && body.includes(normalize(quote));

    // Unsupported criticism is not a finding. An unsupported "ok" is just an
    // "ok", so it keeps its place and loses only the quote.
    if (verdict !== 'ok' && !supported) continue;

    seen.add(check);
    notes.push({ check, verdict, note, ...(supported ? { quote } : {}) });
  }

  if (notes.length < MIN_REPORTED) {
    throw new ReviewParseError(
      `Reviewer reported ${notes.length} of ${CHECK_IDS.length} checks, below the floor of ${MIN_REPORTED}.`,
    );
  }

  return notes;
}

/** Models wrap JSON in fences and open with "Here is the review:". Strip both. */
function extractJson(text: string): string {
  const body = text.trim();
  const fenced = body.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const open = body[start];
  const close = open === '[' ? ']' : '}';
  const end = body.lastIndexOf(close);
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}
