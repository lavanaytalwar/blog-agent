/**
 * Claim-bearing numeral extraction.
 *
 * Not every digit needs provenance — "three levers" and "2026" are prose, not
 * claims. What needs a source is anything shaped like a result: a percentage,
 * a multiplier, a price, a count, or a time-to-value. Failing on every digit
 * would make the gate unusable; failing on none would make it pointless.
 */
export type Numeral = {
  raw: string;        // as written, e.g. "₹45 crore"
  normalized: string; // digits only, e.g. "45"
  index: number;      // character offset, for proximity checks
};

const PATTERNS: RegExp[] = [
  /[+~-]?\d[\d,]*\.?\d*\s?%/g,                                  // 30%, ~40%, 0.5%
  /\d[\d,]*\.?\d*\s?[×xX](?=\s|$|[.,)])/g,                      // 5×, 10x
  /[₹$]\s?\d[\d,]*\.?\d*(?:\s?(?:crore|lakh|cr|k|m|bn))?/gi,    // ₹45 crore, $550,000
  /\d[\d,]*\.?\d*\s?(?:crore|lakh)\b/gi,                        // 45 crore
  /\d[\d,]*\.?\d*\s?[MK]\+?(?=\s|$|[.,)])/g,                    // 47M+, 1.14M
  /\d[\d,]*\+/g,                                                // 100+, 2,300+
  /\d[\d,]*\.?\d*\s?(?:seconds?|minutes?|hours?|days?|weeks?|months?)\b/gi,
];

const YEAR = /^(19|20)\d{2}$/;

export function extractNumerals(text: string): Numeral[] {
  const candidates: Numeral[] = [];

  for (const pattern of PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const raw = m[0].trim();
      const digits = raw.replace(/[^\d.]/g, '').replace(/\.$/, '');
      if (!digits) continue;

      // A bare year is a date, not a claim. Years inside a currency or
      // percentage match are already excluded by the patterns above.
      if (YEAR.test(digits) && !/[%×xX₹$+]/.test(raw)) continue;

      candidates.push({ raw, normalized: normalize(digits), index: m.index ?? 0 });
    }
  }

  // Patterns overlap by design — "₹45 crore" matches the currency rule at the
  // symbol and the crore rule one character later. Keep the widest span and
  // drop anything contained inside it, or one number reports as two failures.
  const spans = candidates
    .map((n) => ({ ...n, end: n.index + n.raw.length }))
    .sort((a, b) => a.index - b.index || b.end - a.end);

  const kept: Numeral[] = [];
  let reach = -1;
  for (const c of spans) {
    if (c.end <= reach) continue; // fully covered by a wider match
    kept.push({ raw: c.raw, normalized: c.normalized, index: c.index });
    reach = Math.max(reach, c.end);
  }
  return kept;
}

/** "2,300" → "2300"; "1.14" stays; trailing ".0" dropped. */
export function normalize(digits: string): string {
  const cleaned = digits.replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  return String(n);
}

/** Expands a ledger numeral into the forms a draft might legitimately write. */
export function ledgerForms(numerals: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of numerals) {
    out.add(normalize(n));
    const asNumber = Number(n);
    if (Number.isFinite(asNumber)) {
      // 1140000 may legitimately appear as 1.14M in prose.
      if (asNumber >= 1_000_000) out.add(normalize(String(asNumber / 1_000_000)));
      if (asNumber >= 1_000) out.add(normalize(String(asNumber / 1_000)));
    }
  }
  return out;
}
