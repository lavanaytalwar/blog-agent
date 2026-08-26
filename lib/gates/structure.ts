import { loadConfig } from '../config/load.js';
import {
  bodyProse, containsPhrase, firstWords, headings, sentences, wordCount,
} from './text.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const META_MIN = 140;
const META_MAX = 160;
const LONG_SENTENCE_WORDS = 15;
const MAX_LONG_SENTENCE_SHARE = 0.4; // brand-voice §9: "mostly under 15 words"

/**
 * Gate 2 — Structure.
 *
 * Shape, not argument. Everything here is measurable off the text alone.
 */
export function structureGate(draft: Draft): GateResult {
  const { blocklist } = loadConfig();
  const failures: Failure[] = [];
  const prose = bodyProse(draft.bodyMd);

  // Three posts already live have percent-encoded curly apostrophes in their
  // slugs. This is the check that stops a fourth.
  if (!SLUG_RE.test(draft.slug)) {
    failures.push({
      rule: 'slug.ascii',
      message: 'Slug must be lowercase ASCII words separated by single hyphens — no periods, apostrophes, or encoded characters.',
      evidence: draft.slug,
    });
  }

  const opening = draft.bodyMd.split('\n').find((l) => l.trim().length > 0) ?? '';
  if (!/tl;?dr/i.test(draft.bodyMd.slice(0, 400))) {
    failures.push({
      rule: 'structure.tldr',
      message: 'Post must open with a labelled TL;DR.',
      evidence: opening.slice(0, 80),
    });
  }

  const metaLength = draft.metaDescription.trim().length;
  if (metaLength < META_MIN || metaLength > META_MAX) {
    failures.push({
      rule: 'meta.length',
      message: `Meta description must be ${META_MIN}–${META_MAX} characters; this is ${metaLength}.`,
      evidence: draft.metaDescription,
    });
  }

  const h2s = headings(draft.bodyMd, 2);
  if (h2s.length === 0) {
    failures.push({ rule: 'structure.h2', message: 'Post needs at least one H2.' });
  }

  // Keyword placement. Meta and first-100-words are where it actually matters.
  const kw = draft.primaryKeyword;
  const placements: [string, string][] = [
    ['title', draft.title],
    ['h1', draft.h1],
    ['meta', draft.metaDescription],
    ['intro', firstWords(prose, 100)],
  ];
  for (const [where, text] of placements) {
    if (!containsPhrase(text, kw)) {
      failures.push({
        rule: `keyword.${where}`,
        message: `Primary keyword "${kw}" does not appear in the ${where}.`,
      });
    }
  }

  // Exactly one CTA, from the approved set.
  const ctas = blocklist.approved_ctas.terms.filter((c) => containsPhrase(prose, c));
  if (ctas.length === 0) {
    failures.push({
      rule: 'cta.present',
      message: `No approved CTA found. Use exactly one of: ${blocklist.approved_ctas.terms.join(' · ')}`,
    });
  } else if (ctas.length > 1) {
    failures.push({
      rule: 'cta.single',
      message: `${ctas.length} CTAs found — offers.md §8 allows exactly one.`,
      evidence: ctas.join(', '),
    });
  }

  const all = sentences(prose);
  const long = all.filter((s) => wordCount(s) > LONG_SENTENCE_WORDS);
  if (all.length > 0 && long.length / all.length > MAX_LONG_SENTENCE_SHARE) {
    const share = Math.round((long.length / all.length) * 100);
    failures.push({
      rule: 'sentence.length',
      message: `${share}% of sentences run over ${LONG_SENTENCE_WORDS} words (limit ${MAX_LONG_SENTENCE_SHARE * 100}%). Helium copy is short-sentence copy.`,
      evidence: long[0]?.slice(0, 90),
    });
  }

  return result('structure', failures);
}
