import { loadConfig } from '../config/load.js';
import { result, type Draft, type GateContext, type Failure, type GateResult } from './types.js';

const norm = (s: string) => s.trim().toLowerCase();

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

  const targeted = new Set(ctx.targetedKeywords.map(norm));
  if (targeted.has(norm(draft.primaryKeyword))) {
    failures.push({
      rule: 'keyword.untargeted',
      message: `"${draft.primaryKeyword}" is already the primary keyword of an existing post. Improve that post instead of writing a competitor to it.`,
      evidence: draft.primaryKeyword,
    });
  }

  const record = keywords.keywords.find((k) => norm(k.keyword) === norm(draft.primaryKeyword));
  if (record?.status === 'covered') {
    failures.push({
      rule: 'keyword.covered',
      message: `Keyword is marked covered in config/keywords.json.`,
      evidence: record.keyword,
    });
  }

  return result('cannibalization', failures);
}
