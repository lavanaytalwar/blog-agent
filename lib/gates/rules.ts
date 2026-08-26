/**
 * Every mechanically-enforced rule, stated once.
 *
 * The gates import their rule ids from here and the prompt is rendered from the
 * same table, so a rule cannot exist in a gate without the writer being told
 * about it. Five real generations failed on rules the prompt never mentioned, * `keyword.h1` among them, which is drift, not a model problem.
 */
export const RULES = {
  // gate 1, strategy
  'qualifier.title': 'Title must contain Shopify, D2C, ecommerce, personalization or merchandising.',
  'qualifier.h1': 'H1 must contain one of those same qualifiers.',
  'competitor.title': 'No competitor brand in the title.',
  'competitor.h1': 'No competitor brand in the H1.',
  'competitor.slug': 'No competitor brand in the slug.',
  'audience_guard.title': 'Seasonal posts must target the brand operator, never the shopper.',
  'keyword.foreign': 'Cover only the keywords this post was selected for and their own secondaries. Other targets on the keyword list belong to other posts; mention one in passing at most.',
  'cluster.targets_agree': 'Every keyword selected for one post must share a cluster.',

  // gate 2, structure
  'slug.ascii': 'Slug: lowercase ASCII words joined by single hyphens. No apostrophes, periods or encoded characters.',
  'structure.tldr': 'Open with a labelled TL;DR, written "**TL;DR:**" with a colon.',
  'structure.h2': 'At least one H2; three or four is better.',
  'meta.length': 'Meta description 140-160 characters including spaces. Count them.',
  'keyword.title': 'Primary keyword must appear in the title.',
  'keyword.h1': 'Primary keyword must appear in the H1, not only in the title.',
  'keyword.meta': 'Primary keyword must appear in the meta description.',
  'keyword.intro': 'Primary keyword must appear in the first 100 words.',
  'keyword.overused': 'Roughly one use of the primary keyword per 100 words, and never more than 8.',
  'keyword.underused': 'At least three uses of the primary keyword in total.',
  'length.floor': 'At least 3,000 characters of prose, plus 1,500 for every additional target. Characters, not words: a word count can be padded with short filler.',
  'keyword.additional_underused': 'Every keyword this post was selected for must be used at least three times, not just the lead one.',
  'keyword.additional_unheaded': 'Every additional selected keyword needs its own H2. A second target earns a section, not a mention.',
  'keyword.secondary_repeated': 'No single secondary keyword may dominate. Spread the uses across the siblings attached to this target.',
  'keyword.secondary_overused': 'Use the secondary keywords roughly twice each, not as a checklist to exhaust.',
  'cta.present': 'Exactly one call to action, from the approved set.',
  'cta.single': 'Only one call to action. Two is a failure, not enthusiasm.',
  'sentence.length': 'No more than 40% of sentences may run over 15 words. Vary the rhythm inside that ceiling, do not write forty identical five-word sentences.',
  'link.commercial': 'Link once to the commercial URL.',
  'link.bare_url': 'The commercial link must be a markdown link with real anchor text, never a bare URL.',

  // gate 3, provenance
  'claim.untraceable': 'Every number must come from the permitted list. No exceptions, no rounding.',
  'claim.blocked': 'Never state a blocked figure, and never invent a replacement for it.',
  'claim.misattributed': 'A customer result belongs to the customer named in its own sentence.',
  'customer.confidential': 'Name no customer outside the permitted list.',

  // gate 5, tone floor
  'tone.hedging': 'No hedging. Not "may improve", not "in some cases", not "could help".',
  'tone.banned_phrase': 'No filler or cliche from the banned list.',
  'tone.ai_mysticism': 'Never say the AI is magic. Name the mechanism.',
  'tone.enterprise_jargon': 'No enterprise jargon that Helium customers do not use.',
  'tone.hard_superlative': 'Never write guaranteed, #1, the only, or proven to.',
  'tone.coined_term': 'Use at least one coined term.',
  'tone.coined_term_undefined': 'Define the coined term in the same sentence you first use it. "Session-aware merchandising is reordering products from live behaviour, not from a segment decided last quarter." Using the term without defining it is the single most common failure.',
  'tone.em_dash': 'No em dashes, en dashes or double hyphens anywhere, including the title and meta description. Use a comma, a colon, or two sentences. This is the loudest machine tell in English prose and it is checked mechanically.',
  'tone.too_polished': 'One sentence in six has to break form: open on "And" or "But", clip a fragment, trail an ellipsis, or drop an aside in parentheses. Prose where every sentence is correctly closed reads like a template being filled in.',
  'tone.opens_on_question': 'Open on an outcome or a contrast. Never on a question.',
} as const;

export type RuleId = keyof typeof RULES;

/** Rules the writer is told about, grouped for the prompt. */
export function promptRules(): string {
  // The separator is a colon, not a dash. This table is rendered straight into
  // the prompt, and `tone.em_dash` bans dashes in what the model writes; handing
  // it forty of them in the rule list is the drift this file exists to prevent.
  return Object.entries(RULES).map(([id, text]) => `- **${id}**: ${text}`).join('\n');
}
