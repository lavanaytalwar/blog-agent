/**
 * Splits Search Console queries into branded and non-brand.
 *
 * This matters more than it looks: the overwhelming majority of Helium's
 * impressions are branded, so any metric that fails to exclude them measures
 * nothing about the content programme.
 *
 * Three things count as branded here:
 *
 *   1. Helium and its misspellings. Real GSC rows include hilium, hellium,
 *      heliam, halium, aehlium, gelium, gallium, ehelium — searchers are bad at
 *      this word, and every one of them is someone looking for Helium.
 *   2. Helium's product names — Pulse, Agentcy, Ad Stack. A search for "pulse
 *      ecommerce" is navigational, not category demand. Some of these rows are
 *      other companies' products with the same name, which is equally not
 *      demand we can win with a blog post.
 *   3. The other Helium AI (he2.ai, ai.helium.com). Branded traffic for someone
 *      else, and not non-brand demand for us either.
 */

/** helium · halium · hilium · hellium · gelium · gallium · hlium · aehlium */
const HELIUM_FUZZY = /[hg][aeiou]{0,2}l{1,2}[aeiou]{0,2}um/i;

const BRAND_TERMS = [
  'helium', 'gethelium', 'get helium', 'oxpecker',
  'agentcy', 'ad stack', 'adstack',
  'he2', 'he.2', 'hai d2c',
];

// Helium's own product name. Common word, so it is matched as a whole word
// only, and this is the one rule here that could in principle catch an
// unrelated query — accepted deliberately, because "pulse" traffic is
// navigational either way.
const PRODUCT_WORDS = /\b(pulse)\b/i;

export function isBranded(query: string): boolean {
  const q = query.toLowerCase();
  if (HELIUM_FUZZY.test(q)) return true;
  if (PRODUCT_WORDS.test(q)) return true;
  return BRAND_TERMS.some((t) => q.includes(t));
}

export function splitBranded<T extends { key: string }>(rows: T[]) {
  const branded: T[] = [];
  const nonBrand: T[] = [];
  for (const row of rows) (isBranded(row.key) ? branded : nonBrand).push(row);
  return { branded, nonBrand };
}
