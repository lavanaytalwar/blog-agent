import { loadConfig } from '../config/load.js';
import { bodyProse, containsPhrase, findPhrases, sentences } from './text.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

/** How far after a coined term we look for its definition. */
const DEFINITION_WINDOW = 160;

/**
 * Word markers need a space in front so "this" does not match inside "thistle".
 * Punctuation markers must not, because the tight appositive —
 * "session velocity—measuring how fast a shopper moves" — is exactly how
 * brand-voice.md writes them, and requiring a leading space rejected a
 * correctly defined term.
 */
const DEFINITION_MARKERS = /(?:\s(?:is|are|means|refers to|describes)\s)|[—–:(]/i;

/**
 * Gate 5 — Tone floor.
 *
 * This gate runs backwards from a normal safety check: it fails drafts for
 * being timid, not for being loud. Helium's brand voice bans hedging outright,
 * and the brief is to sell hard. What stays banned is a short list of claims
 * about the world — guaranteed, #1, the only, proven to — because those create
 * exposure rather than enthusiasm.
 */
export function toneFloorGate(draft: Draft): GateResult {
  const { blocklist, clusters } = loadConfig();
  const failures: Failure[] = [];

  const prose = bodyProse(draft.bodyMd);
  const all = [draft.title, draft.h1, draft.metaDescription, prose].join('\n');

  const hedges = findPhrases(all, blocklist.hedges.terms);
  if (hedges.length) {
    failures.push({
      rule: 'tone.hedging',
      message: `Hedging is banned outright: "${hedges.join('", "')}". State the claim.`,
      evidence: hedges.join(', '),
    });
  }

  for (const [rule, list] of [
    ['tone.banned_phrase', blocklist.banned_phrases.terms],
    ['tone.ai_mysticism', blocklist.banned_ai_mysticism.terms],
    ['tone.enterprise_jargon', blocklist.enterprise_jargon.terms],
  ] as const) {
    const hits = findPhrases(all, list);
    if (hits.length) {
      failures.push({
        rule,
        message: `Banned language: "${hits.join('", "')}".`,
        evidence: hits.join(', '),
      });
    }
  }

  const superlatives = findPhrases(all, blocklist.hard_superlatives.terms);
  if (superlatives.length) {
    failures.push({
      rule: 'tone.hard_superlative',
      message: `"${superlatives.join('", "')}" is a claim about the world, not a way of framing one. Everything short of this list can be written hot.`,
      evidence: superlatives.join(', '),
    });
  }

  // Coined terms are how the brand earns its category. Using one without
  // defining it teaches the reader nothing and cedes the term.
  const cluster = clusters.clusters.find((c) => c.id === draft.clusterId);
  const candidates = cluster?.coined_terms.length
    ? cluster.coined_terms
    : blocklist.coined_terms.terms;

  const used = candidates.filter((t) => containsPhrase(all, t));
  if (used.length === 0) {
    failures.push({
      rule: 'tone.coined_term',
      message: `Use at least one coined term and define it in one clause: ${candidates.join(' · ')}`,
    });
  } else {
    const defined = used.some((term) => {
      const at = all.toLowerCase().indexOf(term.toLowerCase());
      if (at === -1) return false;
      const after = all.slice(at + term.length, at + term.length + DEFINITION_WINDOW);
      return DEFINITION_MARKERS.test(after);
    });
    if (!defined) {
      failures.push({
        rule: 'tone.coined_term_undefined',
        message: `"${used[0]}" is used but never defined. entity-record §10: use the term and define it in one clause.`,
        evidence: used[0],
      });
    }
  }

  // brand-voice §9: "Does the first line state an outcome or a contrast?"
  const first = sentences(prose)[0] ?? '';
  if (first.trim().endsWith('?')) {
    failures.push({
      rule: 'tone.opens_on_question',
      message: 'Opening line is a question. Open on an outcome or a contrast.',
      evidence: first.slice(0, 90),
    });
  }

  return result('tone_floor', failures);
}
