import { loadConfig } from '../config/load.js';
import { containsPhrase, findPhrases } from './text.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

/**
 * Gate 1 — Strategy.
 *
 * Does this draft target something we are allowed to target, for a reader we
 * have defined, without colliding with an entity we do not own?
 */
export function strategyGate(draft: Draft): GateResult {
  const { keywords, clusters, blocklist } = loadConfig();
  const failures: Failure[] = [];

  const keyword = keywords.keywords.find(
    (k) => k.keyword.toLowerCase() === draft.primaryKeyword.toLowerCase(),
  );

  if (!keyword) {
    failures.push({
      rule: 'keyword.known',
      message: 'Primary keyword is not in config/keywords.json. Add it to the sheet and re-ingest before targeting it.',
      evidence: draft.primaryKeyword,
    });
  } else if (keyword.status === 'excluded') {
    failures.push({
      rule: 'keyword.excluded',
      message: `Keyword is excluded: ${keyword.exclusion_reason ?? 'no reason recorded'}`,
      evidence: keyword.keyword,
    });
  } else if (keyword.status === 'unmapped') {
    failures.push({
      rule: 'keyword.unmapped',
      message: 'Keyword has no cluster. A human must map it in config/clusters.json — guessing would break persona targeting.',
      evidence: keyword.keyword,
    });
  }

  const cluster = clusters.clusters.find((c) => c.id === draft.clusterId);
  if (!draft.clusterId || !cluster) {
    failures.push({
      rule: 'cluster.mapped',
      message: 'Draft has no valid cluster.',
      evidence: draft.clusterId ?? '(none)',
    });
  } else if (keyword?.cluster_id && keyword.cluster_id !== cluster.id) {
    failures.push({
      rule: 'cluster.matches_keyword',
      message: `Keyword is mapped to cluster "${keyword.cluster_id}" but the draft claims "${cluster.id}".`,
    });
  }

  if (!draft.personaId) {
    failures.push({ rule: 'persona.mapped', message: 'Draft has no persona.' });
  } else if (cluster && !cluster.personas.includes(draft.personaId)) {
    failures.push({
      rule: 'persona.in_cluster',
      message: `Persona "${draft.personaId}" is not one of cluster "${cluster.id}"'s personas (${cluster.personas.join(', ')}).`,
    });
  }

  // The "Helium" token collides with the element, Helium Network, Helium 10 and
  // at least one other Helium AI. Never ship a title that stands alone.
  const qualifiers = blocklist.required_title_qualifiers.terms;
  for (const [field, value] of [['title', draft.title], ['h1', draft.h1]] as const) {
    if (!qualifiers.some((q) => containsPhrase(value, q))) {
      failures.push({
        rule: `qualifier.${field}`,
        message: `${field} must contain at least one of: ${qualifiers.join(', ')}.`,
        evidence: value,
      });
    }
  }

  const banned = blocklist.competitors_banned_in_slug_title_h1;
  for (const [field, value] of [['slug', draft.slug], ['title', draft.title], ['h1', draft.h1]] as const) {
    const hits = findPhrases(value, banned);
    if (hits.length) {
      failures.push({
        rule: `competitor.${field}`,
        message: `Competitor brand in ${field}: ${hits.join(', ')}. Name the category, not the brand.`,
        evidence: value,
      });
    }
  }

  // Seasonal posts have a measured failure mode: ranking for shopper queries
  // ("zudio upcoming sale 2026") instead of operator queries.
  if (cluster?.audience_guard) {
    const guard = cluster.audience_guard;
    for (const [field, value] of [['title', draft.title], ['h1', draft.h1]] as const) {
      const hits = findPhrases(value, guard.negative_intent_terms);
      if (hits.length) {
        failures.push({
          rule: `audience_guard.${field}`,
          message: `${field} targets shopper intent, not operator intent: "${hits.join('", "')}". ${guard.rule}`,
          evidence: value,
        });
      }
    }
  }

  return result('strategy', failures);
}
