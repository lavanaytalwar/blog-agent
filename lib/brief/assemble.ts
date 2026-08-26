import { loadConfig } from '../config/load.js';
import { serpLessonFor } from './serp.js';
import { lengthBoundsFor } from '../serp/cache.js';
import type { Brief, BriefClaim, BriefTarget, KeywordBudget, SerpCoverage } from './types.js';

/**
 * Turns a keyword into everything a writer needs, deterministically.
 *
 * No model is involved. If the brief is wrong, it is wrong the same way every
 * time, which is the only kind of wrong worth debugging.
 */

/** From the original brief: primary 4-5 uses, secondaries 4-5 combined. */
export const BUDGET: KeywordBudget = { primary: [4, 5], secondariesCombined: [4, 5] };

/**
 * Each additional target brings its own secondaries, so the combined ceiling has
 * to move with the selection or a two-keyword post fails for doing exactly what
 * it was asked to do.
 */
const SECONDARY_BUDGET_PER_TARGET = 4;

/**
 * Word target when nothing has been measured for this keyword.
 *
 * Once `npm run serp:analyze` has read the pages that actually rank, the target
 * tracks their median instead. A keyword whose SERP is 2,000-word buying guides
 * is not answered with a 700-word post just because 700 was the default.
 */
const DEFAULT_TARGET: [number, number] = [700, 1200];

/** Above this the post stops being a blog post, whatever the SERP is doing. */
const TARGET_CEILING = 2400;

function wordTargetFor(
  medianWords: number | undefined,
  extraTargets: number,
): [number, number] {
  const bump = extraTargets * 400;
  if (!medianWords || medianWords < DEFAULT_TARGET[0]) {
    return [DEFAULT_TARGET[0] + bump, DEFAULT_TARGET[1] + bump];
  }
  // Match the median, then give the writer room above it. Beating the SERP on
  // length alone wins nothing, but landing well under it loses by default.
  const low = Math.min(medianWords, TARGET_CEILING) + bump;
  return [low, Math.min(Math.round(low * 1.3), TARGET_CEILING + bump)];
}

export class BriefError extends Error {}

export type AssembleInput = {
  primaryKeyword: string;
  /**
   * Further primaries chosen alongside the lead on the dashboard. Every one of
   * them, and every secondary attached to them, becomes part of what this post
   * is allowed and required to cover.
   */
  additionalKeywords?: string[];
  personaId?: string | null;
  attempt?: number;
  note?: string;
  serpCoverage?: SerpCoverage[];
  existingTitles?: string[];
};

export function assembleBrief(input: AssembleInput): Brief {
  const { keywords, clusters, ledger, blocklist } = loadConfig();

  const lookup = (raw: string) => {
    const found = keywords.keywords.find(
      (k) => k.keyword.toLowerCase() === raw.trim().toLowerCase(),
    );
    if (!found) throw new BriefError(`"${raw}" is not in config/keywords.json.`);
    if (found.status === 'excluded') {
      throw new BriefError(`"${found.keyword}" is excluded: ${found.exclusion_reason ?? 'no reason recorded'}`);
    }
    if (!found.cluster_id) {
      throw new BriefError(`"${found.keyword}" has no cluster. A human must map it in config/clusters.json.`);
    }
    return found;
  };

  const keyword = lookup(input.primaryKeyword);

  // Deduplicated against the lead and against each other, so selecting the same
  // target twice on the dashboard is a no-op rather than a doubled budget.
  const seen = new Set([keyword.keyword.toLowerCase()]);
  const additional = (input.additionalKeywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .map(lookup)
    .filter((k) => {
      const key = k.keyword.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // One post, one cluster. The persona, the commercial URL and the audience
  // guard all hang off the cluster, so a selection spanning two of them has no
  // single correct answer and must be split into two posts instead.
  const straying = additional.filter((k) => k.cluster_id !== keyword.cluster_id);
  if (straying.length) {
    throw new BriefError(
      `Every keyword in one post must share a cluster. "${keyword.keyword}" is in `
      + `"${keyword.cluster_id}"; ${straying.map((k) => `"${k.keyword}" is in "${k.cluster_id}"`).join(', ')}. `
      + 'Generate these as separate posts.',
    );
  }

  const cluster = clusters.clusters.find((c) => c.id === keyword.cluster_id);
  if (!cluster) throw new BriefError(`Cluster "${keyword.cluster_id}" is not defined.`);

  const personaId = input.personaId ?? cluster.personas[0];
  const persona = clusters.personas.find((p) => p.id === personaId);
  if (!persona) throw new BriefError(`Persona "${personaId}" is not defined.`);
  if (!cluster.personas.includes(persona.id)) {
    throw new BriefError(`Persona "${persona.id}" does not belong to cluster "${cluster.id}".`);
  }

  const allowedClaims: BriefClaim[] = ledger.claims.map((c) => ({
    value: c.value,
    source: c.source_ref,
  }));

  // Blocked claims are named so the model knows not to reach for them. Naming
  // them is safer than silence: a model that does not know pricing is unsettled
  // will invent a number, and gate 3 will reject the whole draft for it.
  const blockedClaims = ledger.blocked.map((c) => ({
    value: c.value,
    reason: c.blocked_reason,
  }));

  const measured = serpLessonFor(keyword.keyword);

  const additionalTargets: BriefTarget[] = additional.map((k) => ({
    keyword: k.keyword,
    secondaries: k.secondary_keywords ?? [],
  }));

  const budget: KeywordBudget = {
    primary: BUDGET.primary,
    secondariesCombined: [
      BUDGET.secondariesCombined[0] + additionalTargets.length * SECONDARY_BUDGET_PER_TARGET,
      BUDGET.secondariesCombined[1] + additionalTargets.length * SECONDARY_BUDGET_PER_TARGET,
    ],
  };

  return {
    primaryKeyword: keyword.keyword,
    secondaries: keyword.secondary_keywords ?? [],
    additionalTargets,
    cluster,
    persona,
    commercialUrl: cluster.commercial_url,
    budget,
    allowedClaims,
    blockedClaims,
    // The allowlist goes in, never the confidential roster. Handing a model the
    // list of names it must not use is handing it the secret.
    namableCustomers: blocklist.approved_public_customers.names,
    voice: {
      requiredQualifiers: blocklist.required_title_qualifiers.terms,
      coinedTerms: cluster.coined_terms.length ? cluster.coined_terms : blocklist.coined_terms.terms,
      approvedCtas: blocklist.approved_ctas.terms,
      approvedContrastTargets: cluster.approved_contrast_targets ?? [],
      bannedPhrases: [
        ...blocklist.banned_phrases.terms,
        ...blocklist.banned_ai_mysticism.terms,
        ...blocklist.enterprise_jargon.terms,
      ],
      hedges: blocklist.hedges.terms,
      hardSuperlatives: blocklist.hard_superlatives.terms,
    },
    serpCoverage: input.serpCoverage ?? [],
    ...(measured
      ? { serpLesson: { takenOn: measured.takenOn, source: measured.source, lesson: measured.lesson } }
      : {}),
    wordTarget: wordTargetFor(measured?.lesson.medianWords, additionalTargets.length),
    lengthBounds: lengthBoundsFor(keyword.keyword, additionalTargets.length),
    existingTitles: input.existingTitles ?? [],
    ...(cluster.audience_guard
      ? { audienceGuard: { rule: cluster.audience_guard.rule, avoid: cluster.audience_guard.negative_intent_terms } }
      : {}),
    attempt: input.attempt ?? 1,
    ...(input.note ? { note: input.note } : {}),
  };
}
