import { loadConfig } from '../config/load.js';
import { confidentialNamesIn } from '../linear/merchants.js';
import { bodyProse, containsPhrase } from './text.js';
import { extractNumerals, ledgerForms } from './numerals.js';
import { result, type Draft, type Failure, type GateResult } from './types.js';

/** How close a customer name has to be to a metric to count as attribution. */
const ATTRIBUTION_WINDOW = 120;

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

  // Misattribution: a metric sitting next to a customer name must belong to
  // that customer. Catches a real figure moved onto the wrong brand, which the
  // ledger check alone would wave through.
  const customers = blocklist.approved_public_customers.names;
  for (const name of customers) {
    if (!containsPhrase(searchable, name)) continue;

    const owned = new Set<string>();
    for (const claim of ledger.claims) {
      if (claim.customer === name) for (const f of ledgerForms(claim.numerals)) owned.add(f);
    }

    let from = searchable.toLowerCase().indexOf(name.toLowerCase());
    while (from !== -1) {
      const near = numerals.filter(
        (n) => Math.abs(n.index - from) <= ATTRIBUTION_WINDOW && allowed.has(n.normalized),
      );
      for (const n of near) {
        if (!owned.has(n.normalized)) {
          failures.push({
            rule: 'claim.misattributed',
            message: `"${n.raw}" appears next to ${name}, but no ledger claim assigns that figure to ${name}. Attribute it explicitly or move it away from the brand name.`,
            evidence: `${name} … ${n.raw}`,
          });
        }
      }
      from = searchable.toLowerCase().indexOf(name.toLowerCase(), from + 1);
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
