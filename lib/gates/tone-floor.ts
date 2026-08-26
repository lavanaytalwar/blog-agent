import { loadConfig } from '../config/load.js';
import { bodyProse, containsPhrase, findPhrases, sentences } from './text.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

/** How far after a coined term we look for its definition. */
const DEFINITION_WINDOW = 160;

/**
 * Word markers need a space in front so "this" does not match inside "thistle".
 * Punctuation markers must not.
 *
 * The em dash used to be in this set: the tight appositive
 * "session velocity, measuring how fast a shopper moves" was written with one
 * and the gate rejected it. Dashes are now banned outright as the loudest
 * machine tell in English prose, so the appositive is written with a comma.
 *
 * That comma branch is anchored and must be followed by a participle or a
 * relative pronoun. A bare comma would make this rule satisfiable by any
 * sentence that happens to have one, which is not a definition.
 */
const DEFINITION_MARKERS =
  /(?:\s(?:is|are|means|refers to|describes)\s)|[:(]|^,\s+(?:\w+ing|which|where|meaning)\b/i;

/**
 * Em and en dashes, plus the double hyphen people reach for instead.
 *
 * Nothing is wrong with an em dash. It is banned because almost no one types
 * one, and a page full of them is the single most reliable signal that a
 * machine wrote the copy. A comma, a colon or a full stop does the same work.
 */
const DASHES = /[—–]|(?<=\S)--(?=\S)/g;

/**
 * How often the prose is required to break form. One in six sentences, matching
 * the ask: a post where every sentence is correctly closed reads like a
 * template being filled in.
 */
const INFORMAL_EVERY = 6;

/**
 * What counts as breaking form. Deliberately not a grammar check — these are
 * the marks of someone talking, and every one of them is safe to publish:
 * a sentence opening on a conjunction, a clipped fragment, a trailing
 * ellipsis, or an aside in parentheses.
 */
function informalBreaks(list: string[]): number {
  return list.filter((raw) => {
    const t = raw.trim();
    if (/^(and|but|so|or|because|yet|then|which)\b/i.test(t)) return true;
    if (/\.{3}|…/.test(t)) return true;
    if (/\([^)]+\)/.test(t)) return true;
    // A clipped fragment. "Every time." "Not the ad."
    if (t.split(/\s+/).filter(Boolean).length <= 4) return true;
    return false;
  }).length;
}

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
    // Every occurrence, not just the first. The first is almost always the H2
    // heading, and the definition lands in the paragraph under it. Checking
    // only index 0 failed correctly-defined terms.
    const defined = used.some((term) => {
      const hay = all.toLowerCase();
      const needle = term.toLowerCase();
      for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
        const after = all.slice(at + term.length, at + term.length + DEFINITION_WINDOW);
        if (DEFINITION_MARKERS.test(after)) return true;
      }
      return false;
    });
    if (!defined) {
      failures.push({
        rule: 'tone.coined_term_undefined',
        message: `"${used[0]}" is used but never defined. entity-record §10: use the term and define it in one clause.`,
        evidence: used[0],
      });
    }
  }

  // The dash is the loudest machine tell in English prose. Checked across
  // everything a reader sees, meta and title included — those are the two lines
  // that show up in a search result.
  const dashes = all.match(DASHES);
  if (dashes) {
    const at = prose.match(/[^.!?\n]*[—–][^.!?\n]*/)?.[0] ?? '';
    failures.push({
      rule: 'tone.em_dash',
      message: `${dashes.length} dash${dashes.length === 1 ? '' : 'es'} in the draft. Use a comma, a colon, or two sentences.`,
      evidence: at.trim().slice(0, 90),
    });
  }

  // Prose that never breaks form reads like a template. One sentence in six has
  // to sound like someone talking.
  const proseSentences = sentences(prose);
  const wanted = Math.floor(proseSentences.length / INFORMAL_EVERY);
  const got = informalBreaks(proseSentences);
  if (wanted > 0 && got < wanted) {
    failures.push({
      rule: 'tone.too_polished',
      message: `Only ${got} of ${proseSentences.length} sentences break form; this post needs at least ${wanted}. Start one on "And" or "But", clip one to a fragment, drop an aside in parentheses.`,
      evidence: `${got}/${wanted}`,
    });
  }

  // brand-voice §9: "Does the first line state an outcome or a contrast?"
  const first = proseSentences[0] ?? '';
  if (first.trim().endsWith('?')) {
    failures.push({
      rule: 'tone.opens_on_question',
      message: 'Opening line is a question. Open on an outcome or a contrast.',
      evidence: first.slice(0, 90),
    });
  }

  return result('tone_floor', failures);
}
