import { loadConfig } from '../config/load.js';
import type { Brief, BriefClaim, KeywordBudget, SerpCoverage } from './types.js';

/**
 * Turns a keyword into everything a writer needs, deterministically.
 *
 * No model is involved. If the brief is wrong, it is wrong the same way every
 * time, which is the only kind of wrong worth debugging.
 */

/** From the original brief: primary 4-5 uses, secondaries 4-5 combined. */
export const BUDGET: KeywordBudget = { primary: [4, 5], secondariesCombined: [4, 5] };

export class BriefError extends Error {}

export type AssembleInput = {
  primaryKeyword: string;
  personaId?: string | null;
  attempt?: number;
  note?: string;
  serpCoverage?: SerpCoverage[];
  existingTitles?: string[];
};

export function assembleBrief(input: AssembleInput): Brief {
  const { keywords, clusters, ledger, blocklist } = loadConfig();

  const keyword = keywords.keywords.find(
    (k) => k.keyword.toLowerCase() === input.primaryKeyword.trim().toLowerCase(),
  );
  if (!keyword) throw new BriefError(`"${input.primaryKeyword}" is not in config/keywords.json.`);
  if (keyword.status === 'excluded') {
    throw new BriefError(`"${keyword.keyword}" is excluded: ${keyword.exclusion_reason ?? 'no reason recorded'}`);
  }
  if (!keyword.cluster_id) {
    throw new BriefError(`"${keyword.keyword}" has no cluster. A human must map it in config/clusters.json.`);
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

  return {
    primaryKeyword: keyword.keyword,
    secondaries: keyword.secondary_keywords ?? [],
    cluster,
    persona,
    commercialUrl: cluster.commercial_url,
    budget: BUDGET,
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
    existingTitles: input.existingTitles ?? [],
    ...(cluster.audience_guard
      ? { audienceGuard: { rule: cluster.audience_guard.rule, avoid: cluster.audience_guard.negative_intent_terms } }
      : {}),
    attempt: input.attempt ?? 1,
    ...(input.note ? { note: input.note } : {}),
  };
}
