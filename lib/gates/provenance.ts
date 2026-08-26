import { loadConfig } from '../config/load.js';
import { confidentialNamesIn } from '../linear/merchants.js';
import { bodyProse, containsPhrase, sentences } from './text.js';
import { extractNumerals, ledgerForms } from './numerals.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

/**
 * Gate 3 — Claim provenance.
 *
 * The gate that protects Helium from publishing a number it cannot defend.
 * Three checks, in order of severity:
 *
 *   1. Blocked claims — facts that exist but are not settled (pricing, founder
 *      titles). Matched on literal patterns, because ₹100 and $100 share a
 *      numeral but only one of them is blocked.
 *   2. Untraceable numerals — any result-shaped number with no ledger entry.
 *   3. Misattribution — a real number bolted onto the wrong brand.
 *   4. A confidential merchant name. Forty of Helium's fifty-four Linear
 *      merchants are not publicly namable, and several — Ted Baker, Sandro,
 *      Watsons, Swiss Beauty — would matter if they leaked. This check fails
 *      closed against the roster rather than trusting the draft.
 */
export function provenanceGate(draft: Draft): GateResult {
  const { ledger, blocklist } = loadConfig();
  const failures: Failure[] = [];

  const prose = bodyProse(draft.bodyMd);
  const searchable = [draft.title, draft.h1, draft.metaDescription, prose].join('\n');

  for (const blocked of ledger.blocked) {
    const hits = blocked.patterns.filter((p) => searchable.includes(p));
    if (hits.length) {
      failures.push({
        rule: 'claim.blocked',
        message: `"${hits.join('", "')}" is blocked. ${blocked.blocked_reason}`,
        evidence: blocked.key,
      });
    }
  }

  const leaked = confidentialNamesIn(searchable);
  if (leaked.length) {
    failures.push({
      rule: 'customer.confidential',
      message: `"${leaked.join('", "')}" is a Helium merchant that is not public. Only brands already named in Helium's own marketing may appear in a post.`,
      evidence: leaked.join(', '),
    });
  }

  const allowed = new Set<string>();
  for (const claim of ledger.claims) {
    for (const form of ledgerForms(claim.numerals)) allowed.add(form);
  }

  const numerals = extractNumerals(searchable);
  for (const n of numerals) {
    if (!allowed.has(n.normalized)) {
      failures.push({
        rule: 'claim.untraceable',
        message: `"${n.raw}" is not in the claim ledger. Every result-shaped number needs a source in config/claim-ledger.json.`,
        evidence: n.raw,
      });
    }
  }

  // Misattribution: a figure belongs to the customer named in its own sentence.
  //
  // Character distance is the wrong model. In "W for Woman saw revenue per visit
  // up 27% in 4 weeks. Sudathi saw a 25% conversion uplift." the 27% is nearer to
  // "Sudathi" than to the start of "W for Woman", so a proximity rule blames the
  // wrong brand on a correct draft. Sentences are how attribution actually reads.
  const owners = new Map<string, Set<string>>();
  for (const claim of ledger.claims) {
    if (!claim.customer) continue;
    const set = owners.get(claim.customer) ?? new Set<string>();
    for (const f of ledgerForms(claim.numerals)) set.add(f);
    owners.set(claim.customer, set);
  }
  const attributable = new Set([...owners.values()].flatMap((set) => [...set]));
  const customers = blocklist.approved_public_customers.names;

  for (const sentence of sentences(searchable)) {
    const named = customers.filter((name) => containsPhrase(sentence, name));
    if (named.length === 0) continue;

    for (const n of extractNumerals(sentence)) {
      // Only figures some customer owns are attributable at all. A platform
      // stat in the same sentence as a brand is context, not a claim about it.
      if (!attributable.has(n.normalized)) continue;
      if (named.some((name) => owners.get(name)?.has(n.normalized))) continue;

      failures.push({
        rule: 'claim.misattributed',
        message: `"${n.raw}" is stated in the same sentence as ${named.join(' and ')}, but no ledger claim assigns that figure to ${named.length > 1 ? 'either' : named[0]}. Attribute it to the brand that earned it.`,
        evidence: `${named.join(', ')} … ${n.raw}`,
      });
    }
  }

  // Dedupe — the same numeral can trip more than one loop.
  const seen = new Set<string>();
  const unique = failures.filter((f) => {
    const key = `${f.rule}:${f.evidence ?? f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return result('provenance', unique);
}
