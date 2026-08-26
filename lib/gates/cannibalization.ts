import { loadConfig } from '../config/load.js';
import { bodyProse, containsPhrase } from './text.js';
import { result, type Draft, type GateContext, type Failure, type GateResult } from './types.js';

const norm = (s: string) => s.trim().toLowerCase();

/**
 * One passing mention of another target is normal writing. Repeated use means
 * the post is competing with a post that does not exist yet, or with one that
 * does.
 */
const FOREIGN_MENTION_LIMIT = 1;

function countPhrase(haystack: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

/**
 * Gate 4 — Cannibalization.
 *
 * Two posts chasing one keyword compete with each other, and the second one
 * usually wins nothing while costing the first. Pure: existing slugs and
 * targeted keywords are passed in, never fetched, so this is trivially testable
 * and cannot silently pass because a network call failed.
 */
export function cannibalizationGate(draft: Draft, ctx: GateContext): GateResult {
  const { keywords } = loadConfig();
  const failures: Failure[] = [];

  const slugs = new Set(ctx.existingSlugs.map(norm));
  if (slugs.has(norm(draft.slug))) {
    failures.push({
      rule: 'slug.unique',
      message: 'A post with this slug already exists.',
      evidence: draft.slug,
    });
  }

  // Every keyword this post claims — the lead and any selected alongside it —
  // must be free. Checking only the lead would let a second post quietly absorb
  // a target the first one already owns.
  const claimed = [draft.primaryKeyword, ...draft.additionalKeywords];
  const targeted = new Set(ctx.targetedKeywords.map(norm));
  for (const kw of claimed) {
    if (targeted.has(norm(kw))) {
      failures.push({
        rule: 'keyword.untargeted',
        message: `"${kw}" is already the primary keyword of an existing post. Improve that post instead of writing a competitor to it.`,
        evidence: kw,
      });
    }
  }

  // A post targets the keywords it was asked to target and their secondaries.
  // Any other primary used repeatedly means two posts chasing one query, which
  // is the same problem as a duplicate slug wearing different clothes.
  const records = claimed
    .map((kw) => keywords.keywords.find((k) => norm(k.keyword) === norm(kw)))
    .filter((k): k is NonNullable<typeof k> => Boolean(k));
  const ownTerms = new Set([
    ...claimed.map(norm),
    ...records.flatMap((k) => (k.secondary_keywords ?? []).map((s) => norm(s.keyword))),
  ]);
  const searchable = [draft.title, draft.h1, draft.metaDescription, bodyProse(draft.bodyMd)].join('\n');

  for (const other of keywords.keywords) {
    if (other.status === 'excluded') continue;
    if (ownTerms.has(norm(other.keyword))) continue;
    // A term this post legitimately owns as a secondary is not foreign, even
    // when some other keyword record also lists it.
    if ([...ownTerms].some((t) => t.includes(norm(other.keyword)))) continue;

    const uses = countPhrase(searchable, other.keyword);
    if (uses > FOREIGN_MENTION_LIMIT) {
      failures.push({
        rule: 'keyword.foreign',
        message: `"${other.keyword}" is a separate target and appears ${uses} times. A post covers the keywords it was selected for and their secondaries; anything else competes with the post that should own it.`,
        evidence: other.keyword,
      });
    }
  }

  for (const record of records) {
    if (record.status === 'covered') {
      failures.push({
        rule: 'keyword.covered',
        message: `"${record.keyword}" is marked covered in config/keywords.json.`,
        evidence: record.keyword,
      });
    }
  }

  return result('cannibalization', failures);
}
