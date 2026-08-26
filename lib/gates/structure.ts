import { loadConfig } from '../config/load.js';
import {
  bodyProse, containsPhrase, countNonOverlapping, firstWords, headings, sentences, wordCount,
} from './text.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const META_MIN = 140;
const META_MAX = 160;
const LONG_SENTENCE_WORDS = 15;
const MAX_LONG_SENTENCE_SHARE = 0.4; // brand-voice §9: "mostly under 15 words"

/**
 * A floor, not a target. Measured against real output: a 233-word post was
 * generated for a keyword whose entire SERP is 2,000-word buying guides. It
 * would never rank, and no other gate noticed.
 */
const MIN_WORDS = 500;

/**
 * Each additional target has to be genuinely covered, not name-dropped. A post
 * asked to own two keywords needs the room to say something real about both, so
 * the floor moves with the selection rather than letting a 500-word post claim
 * three targets.
 */
const WORDS_PER_ADDITIONAL_TARGET = 250;

/**
 * An additional target earns its place by carrying a section, not by appearing
 * in a list. Requiring it in an H2 is the cheapest honest test of that: prose
 * can mention anything, a heading is a commitment.
 */
const ADDITIONAL_TARGET_MIN_USES = 3;

/**
 * Keyword budget.
 *
 * The original brief said 4-5 uses of the primary, but title, H1, meta and the
 * first 100 words are all mandatory placements — that is four before a single
 * sentence of body copy. Five real drafts landed at 5-6 uses, which is correct
 * writing failing an impossible arithmetic. The range is widened and paired
 * with a density cap, which is what the rule was actually protecting against.
 */
const PRIMARY_USES = { min: 3, absoluteMax: 8 };

/**
 * The ceiling scales with length rather than being a fixed count, and is
 * expressed in occurrences rather than word-share. Standard keyword density —
 * (keyword words x uses) / total words — punishes long-tail phrases: "how to
 * improve revenue per visitor" used five times in a 550-word post scores 4.5%
 * purely for being five words long. Occurrences per hundred words does not
 * have that bias.
 */
const USES_PER_100_WORDS = 1;

/**
 * The original brief said secondaries 4-5 combined. Real drafts land at 5-13
 * across five distinct terms, which is normal writing rather than stuffing —
 * so this is a ceiling that scales, not the flat number.
 */
const SECONDARY_USES_PER_100_WORDS = 2;
const SECONDARY_ABSOLUTE_MAX = 16;
const maxUses = (words: number) =>
  Math.min(PRIMARY_USES.absoluteMax, Math.max(4, Math.ceil((words / 100) * USES_PER_100_WORDS)));

/**
 * Gate 2 — Structure.
 *
 * Shape, not argument. Everything here is measurable off the text alone.
 */
/** Case-insensitive occurrence count for a phrase. */
function countPhrase(haystack: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) ?? []).length;
}

export function structureGate(draft: Draft): GateResult {
  const { blocklist, clusters } = loadConfig();
  const commercialUrl =
    clusters.clusters.find((c) => c.id === draft.clusterId)?.commercial_url
    ?? 'https://www.gethelium.co/merchandising';
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

  const extra = draft.additionalKeywords;
  const floor = MIN_WORDS + extra.length * WORDS_PER_ADDITIONAL_TARGET;
  const words = wordCount(prose);
  if (words < floor) {
    failures.push({
      rule: 'length.floor',
      message: extra.length
        ? `Post is ${words} words and covers ${extra.length + 1} targets. The floor for that many is ${floor}.`
        : `Post is ${words} words. Below ${floor} it cannot compete with the pages already ranking for this keyword.`,
      evidence: `${words} words`,
    });
  }

  // Count across everything a reader and a crawler both see.
  const searchable = [draft.title, draft.h1, draft.metaDescription, prose].join('\n');
  const primary = countNonOverlapping(searchable, [kw]);
  const uses = primary.total;
  const ceiling = maxUses(words);
  if (uses > ceiling) {
    failures.push({
      rule: 'keyword.overused',
      message: `Primary keyword appears ${uses} times in ${words} words; the ceiling here is ${ceiling}. Write more, or use it less.`,
      evidence: `${uses} uses`,
    });
  } else if (uses < PRIMARY_USES.min) {
    failures.push({
      rule: 'keyword.underused',
      message: `Primary keyword appears ${uses} times; it needs at least ${PRIMARY_USES.min}.`,
      evidence: `${uses} uses`,
    });
  }

  // Each additional target must be covered, not name-dropped: used in the body
  // and owned by a heading. Without this a post could be selected for three
  // keywords and quietly write about one.
  const h2Text = h2s.join('\n');
  for (const target of extra) {
    const targetUses = countNonOverlapping(searchable, [target], primary.spans).total;
    if (targetUses < ADDITIONAL_TARGET_MIN_USES) {
      failures.push({
        rule: 'keyword.additional_underused',
        message: `"${target}" was selected as a target for this post but appears ${targetUses} times; it needs at least ${ADDITIONAL_TARGET_MIN_USES}.`,
        evidence: `${targetUses} uses`,
      });
    }
    if (!containsPhrase(h2Text, target)) {
      failures.push({
        rule: 'keyword.additional_unheaded',
        message: `"${target}" was selected as a target but no H2 covers it. A second target needs its own section, not a mention.`,
        evidence: target,
      });
    }
  }

  // Every selected target contributes its own secondaries — that is what
  // selecting it means.
  const config = loadConfig().keywords.keywords;
  const secondaries = [kw, ...extra].flatMap((k) =>
    (config.find((r) => r.keyword.toLowerCase() === k.toLowerCase())?.secondary_keywords ?? [])
      .map((sec) => sec.keyword),
  );

  // Secondaries are counted in what the primary did not already claim, so a
  // primary that contains a secondary is not billed for both.
  const secondaryUses = countNonOverlapping(searchable, secondaries, primary.spans).total;
  const targets = extra.length + 1;
  const secondaryCeiling = Math.min(
    SECONDARY_ABSOLUTE_MAX * targets,
    Math.max(6 * targets, Math.ceil((words / 100) * SECONDARY_USES_PER_100_WORDS)),
  );
  if (secondaryUses > secondaryCeiling) {
    failures.push({
      rule: 'keyword.secondary_overused',
      message: `Secondary keywords appear ${secondaryUses} times in ${words} words; the ceiling here is ${secondaryCeiling}.`,
      evidence: `${secondaryUses} uses`,
    });
  }

  // The commercial link is the entire commercial point of the post.
  if (!draft.bodyMd.includes(commercialUrl)) {
    failures.push({
      rule: 'link.commercial',
      message: `Post must link to ${commercialUrl} once.`,
    });
  } else if (!new RegExp(`\\[[^\\]]+\\]\\(${commercialUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(draft.bodyMd)) {
    failures.push({
      rule: 'link.bare_url',
      message: 'The commercial link is a bare URL. Use markdown link text so the anchor carries meaning.',
      evidence: commercialUrl,
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
