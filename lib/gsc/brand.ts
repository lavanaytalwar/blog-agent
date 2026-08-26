/**
 * Splits Search Console queries into branded and non-brand.
 *
 * This matters more than it looks: 97.6% of Helium's impressions are branded,
 * so any metric that doesn't exclude them measures nothing about the content
 * programme. The misspelling set is drawn from real GSC rows — hilium, hellium,
 * heliam, gelium, ehelium all resolve to people looking for Helium.
 *
 * he2 / he.2 / ai.helium are the *other* Helium AI. They are branded traffic
 * for someone else, but they are not non-brand demand for us either, so they
 * are classified as branded and excluded from content metrics.
 */
const BRAND = /heli|hell?ium|heliam|hilium|gelium|ehelium|geth[ea]lium|\bhe2\b|\bhe\.2\b|oxpecker|agentcy/i;

export function isBranded(query: string): boolean {
  return BRAND.test(query);
}

export function splitBranded<T extends { key: string }>(rows: T[]) {
  const branded: T[] = [];
  const nonBrand: T[] = [];
  for (const row of rows) (isBranded(row.key) ? branded : nonBrand).push(row);
  return { branded, nonBrand };
}
