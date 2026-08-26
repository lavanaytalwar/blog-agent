/**
 * Collapses keyword variants to one identity.
 *
 * The sheet already carries the problem inside a single entry —
 * "ecommerce personalization / personalization for ecommerce" — and Search
 * Console holds four near-identical forms of the same thing. Without folding,
 * every mining run would re-propose terms that are already targeted.
 *
 * One distinction matters and is enforced by the caller, not here: variants are
 * blocked as separate PRIMARIES and allowed as SECONDARIES of one primary.
 * Folding without that distinction would discard exactly the terms mining
 * exists to collect.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with',
  'my', 'your', 'our', 'is', 'are', 'and', 'or',
]);

/** British to American, matching the -ize decision in brand-voice.md §6. */
function foldSpelling(word: string): string {
  return word
    .replace(/isation$/, 'ization')
    .replace(/isations$/, 'izations')
    .replace(/ise$/, 'ize')
    .replace(/ised$/, 'ized')
    .replace(/ising$/, 'izing')
    .replace(/optimisation/, 'optimization')
    .replace(/personalisation/, 'personalization')
    .replace(/personalise/, 'personalize');
}

/** Crude but sufficient: platforms → platform, tools → tool, boxes → box. */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Joins a stranded single letter to the word after it, so "e-commerce" and
 * "e commerce" both become "ecommerce" rather than splitting into a token that
 * matches nothing.
 */
function mergeSingleLetters(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = words[i + 1];
    if (word.length === 1 && /[a-z]/.test(word) && next) {
      out.push(word + next);
      i++;
      continue;
    }
    out.push(word);
  }
  return out;
}

export function tokens(input: string): string[] {
  const words = input
    .toLowerCase()
    .replace(/[''']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return mergeSingleLetters(words)
    .map(foldSpelling)
    .map(singularize)
    .filter((t) => !STOPWORDS.has(t));
}

/** Order-independent identity. "personalization for ecommerce" === "ecommerce personalization". */
export function fingerprint(input: string): string {
  return [...new Set(tokens(input))].sort().join(' ');
}

/** True when two keywords are the same target written differently. */
export function sameTarget(a: string, b: string): boolean {
  return fingerprint(a) === fingerprint(b);
}

/**
 * A candidate is a variant of a primary — a legitimate secondary — when it
 * shares most of the primary's tokens but is not identical to it.
 */
export function isVariantOf(candidate: string, primary: string): boolean {
  const c = new Set(tokens(candidate));
  const p = new Set(tokens(primary));
  if (fingerprint(candidate) === fingerprint(primary)) return false;
  if (p.size === 0) return false;
  const shared = [...p].filter((t) => c.has(t)).length;
  return shared / p.size >= 0.6;
}
