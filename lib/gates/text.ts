/**
 * Shared text helpers. Everything here is deliberately boring and testable —
 * the gates are only trustworthy if the primitives underneath them are.
 */

/** Strips markdown syntax so phrase matching sees prose, not formatting. */
export function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')        // fenced code
    .replace(/`[^`]*`/g, ' ')                // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/^#{1,6}\s+/gm, '')             // headings
    .replace(/[*_>]/g, '')                   // emphasis, quotes
    .replace(/\r/g, '');
}

/** Case-insensitive whole-phrase search. Escapes regex metacharacters. */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b does not work around punctuation-bearing phrases like "#1" or "5×",
  // so guard with non-word lookarounds only where the edge is a word char.
  const left = /^\w/.test(phrase) ? '(?<![\\w-])' : '';
  const right = /\w$/.test(phrase) ? '(?![\\w-])' : '';
  return new RegExp(`${left}${escaped}${right}`, 'i').test(haystack);
}

export function findPhrases(haystack: string, phrases: string[]): string[] {
  return phrases.filter((p) => containsPhrase(haystack, p));
}

/** First N words of the body, used for keyword-placement checks. */
export function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(' ');
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Markdown H2 lines, without the leading hashes. */
export function headings(md: string, level: number): string[] {
  const marker = '#'.repeat(level);
  return md
    .split('\n')
    .filter((l) => l.startsWith(`${marker} `))
    .map((l) => l.slice(marker.length + 1).trim());
}

/** Body with front matter and headings removed — the prose a reader reads. */
export function bodyProse(md: string): string {
  return toPlainText(md.replace(/^---[\s\S]*?---\n/, ''));
}

/**
 * Counts phrase occurrences without double-counting overlaps.
 *
 * Long-tail keywords nest: "revenue per visitor" contains "revenue per visit",
 * so naive counting scores one mention twice and a correctly written post
 * trips a budget it never exceeded. Longest match at a position wins, and
 * claimed spans are not reused.
 */
export function countNonOverlapping(
  haystack: string,
  terms: string[],
  claimed: [number, number][] = [],
): { total: number; spans: [number, number][] } {
  const spans: [number, number][] = [...claimed];
  const overlaps = (a: number, b: number) => spans.some(([s, e]) => a < e && b > s);

  let total = 0;
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    if (!term.trim()) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of haystack.matchAll(new RegExp(escaped, 'gi'))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      spans.push([start, end]);
      total++;
    }
  }
  return { total, spans };
}
