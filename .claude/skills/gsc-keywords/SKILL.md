---
name: gsc-keywords
description: Mine Search Console, the keyword sheet's SERP data, and Linear for new primary keywords and for secondary keywords attached to existing primaries. Use when adding secondaries to a primary, hunting new targets, or refreshing the keyword list after a GSC sync. Writes back to config/keywords.json with provenance on every term, and never proposes a keyword twice.
---

# Keyword mining

Fills `config/keywords.json` with new primaries and with up to five secondaries per
primary. Every keyword that ships carries evidence for why it exists.

**Two outputs from one dataset**, and they are not interchangeable:
- **Striking-distance primaries** — queries Helium ranks for but does not win
- **Secondaries** — supporting terms for a primary that is already targeted

The split of work is the same one the gates use: **the scripts are deterministic, the
judgment is yours.** Do not re-implement the SQL and do not move a threshold — read what
the miner emits and decide which candidates are real.

## Before you start

Read `config/keyword-history.json`. Every keyword ever proposed, accepted, rejected or
excluded is in there with a normalised fingerprint. **A keyword in that file is never
proposed again**, whatever its verdict was. This is the rule that stops the same terms
resurfacing every run.

Note the run date and counts, so step 7 can diff against them.

## Procedure

### 1. Refresh the data

```
npm run gsc:sync 90
npm run gsc:mine
```

Add `--json` when you want to process the output rather than read it.

### 2. Know what was filtered out

The two lists use different bars, because they answer different questions.

| | Filter | Why |
|---|---|---|
| **Striking distance** | ≥10 impressions, average position 11–20 | A page already ranking on page two can be pushed to page one. Below 10 impressions there is no demand to win; above position 20 a rewrite will not close the gap. |
| **Secondaries** | ≥2 impressions, shares ≥60% of the primary's tokens | A secondary needs evidence and shared intent, not a ranking. Position barely matters. |

Both lists exclude anything already targeted, anything in the history ledger, and
anything matching `config/query-noise.json`.

### 3. Classify every candidate

Four questions, in order. A yes to any of the first three disqualifies the candidate,
and it goes into `config/query-noise.json` so no future run re-litigates it.

- **Is it Helium?** Including misspellings — `halium`, `aehlium`, `gallium`, `hilium` —
  and product names: `pulse`, `agentcy`, `ad stack`. `lib/gsc/brand.ts` catches most
  already; anything that slipped through belongs in the noise file, not the keyword list.
- **Is it another company's brand?** `unlimited design agency`, `vivid ai`,
  `xyrix pulse ai` recur every run and are already listed. New ones will appear.
- **Is it shopper intent rather than operator intent?** This is the
  `zudio upcoming sale 2026` test — Helium ranks #1 for it and converts nobody. If a
  merchant's *customer* would search it, it is not a target. Same rule the seasonal
  cluster's audience guard already encodes.
- **Does it share intent with the primary, or is it merely topically adjacent?** A
  secondary that shifts intent is a different post, not a supporting term.

### 4. Fill the gaps, in descending order of evidence

Search Console covers two primaries out of twenty-four. For the rest, work down this
ladder and stop at the first tier that produces something real.

| Tier | Source | Tag |
|---|---|---|
| 1 | Search Console impressions | `gsc` |
| 2 | Headings of the top-5 ranking pages in the primary's `serp_competitors` | `serp` |
| 3 | Model-proposed, from `customer-language.md` §6 vocabulary and the cluster's coined terms | `proposed` |
| 4 | Nothing | `none` |

**Tier 2** is not our data, but it is real data: those pages rank, so what they cover is
evidence about the intent cluster. Read the actual pages; do not infer from the URL.

**Tier 3 is a proposal, not a finding.** Anything tagged `proposed` is awaiting a human
decision and must be visibly distinguishable on `/keywords`. Never let a `proposed` term
be described as evidence-backed, and never promote one to `gsc` or `serp` without the
underlying evidence.

### 5. Pull capability seeds from Linear

```
npm run linear:merchants
```

Three extractions, and they are not interchangeable:

- **Internal projects** — `Ad Stack`, `Core Platform`, `Agents`, `Data & Analytics`,
  `Growth` — describe what Helium ships with no merchant attached. The cleanest source.
- **Merchant projects** yield a **vertical**, never a name. Work for a haircare brand
  becomes `haircare ecommerce personalization`, never the brand.
- **ENG issues** carry capability detail behind a project prefix —
  `kisah: moving down if M and L size products are oos in collection page` describes
  out-of-stock suppression. Strip the prefix, keep the capability.

A capability seed is only a target if the capability is already live on gethelium.co.

### 6. Write back

`config/keywords.json` is the source of truth and is committed, so a change in targeting
shows up in a diff rather than mutating silently in a database. The database is a mirror,
refreshed with `npm run seed`.

**Every secondary carries its provenance.** A year from now it must be possible to tell
which terms were evidence-backed and which someone added by hand.

```jsonc
{
  "keyword": "ecommerce personalization / personalization for ecommerce",
  "secondary_source": "gsc",          // gsc | serp | proposed | none | excluded
  "secondary_keywords": [
    {
      "keyword": "ecommerce personalization platform",
      "source": "gsc",
      "impressions": 76,               // gsc only
      "position": 47,                  // gsc only
      "window": "2025-06-03..2026-08-23",
      "variants": ["ecommerce personalisation platform", "..."]
    },
    {
      "keyword": "product recommendation engine",
      "source": "serp",
      "evidence": "https://helloretail.com/en/learn/product-recommendations/ — H2",
      "window": "2026-08-26"
    }
  ]
}
```

`serp` and `proposed` entries carry `evidence` instead of impressions — a URL and the
heading it came from, or the vocabulary source. An entry with neither is not writable.

Then record **every** candidate in `config/keyword-history.json`, including the rejected
ones with their reason.

### 7. Report, and diff against the last run

- Candidates seen, kept, rejected — **and what changed since the previous run**
- Which primaries gained secondaries; which are still `none`
- New entries added to the noise file
- Coverage by tier: how many primaries are `gsc`, `serp`, `proposed`, `none`

Growth is the point. A run that reports the same numbers as the last one is telling you
Helium's search position has not moved, which is information.

## The rule that matters most

**Never pad to five.** If Search Console, the SERP pages and Linear together produce two
secondaries for a primary, write two. If they produce none, write `[]` and
`secondary_source: "none"`.

Inventing a keyword is the same failure as inventing a metric. Today the evidence-backed
yield is two primaries out of twenty-four; filling the rest by invention would mean
fabricating around a hundred terms and would make the whole file untrustworthy.

## Confidentiality

Fifty-four merchants appear in Linear and **forty of them are not publicly namable** —
Ted Baker, Sandro, Maje, Watsons, Swiss Beauty, Wrogn, BBlunt and Kisah among them.

`config/merchants.json` is the roster. `confidentialNamesIn()` in
`lib/linear/merchants.ts` fails closed against it, and gate 3 refuses any draft
containing one. Do not weaken that check, and never write a merchant name into a keyword.

## Never do these

- **Assign a cluster to a new keyword.** `scripts/ingest-keywords.ts` deliberately
  refuses to guess, because a wrong cluster silently breaks persona targeting. Leave it
  `unmapped` and say so in the report.
- **Mark a keyword `covered`.** That is derived from posts, not asserted.
- **Touch `config/claim-ledger.json`.** Different file, different gate, different rules.
- **Relax a threshold** to produce a nicer-looking result.
- **Describe a `proposed` term as evidence-backed.**

## Expected outcome

Thin. There are 181 non-brand queries in total and roughly fifteen are genuinely minable,
because Helium does not yet rank in most of the spaces it targets.

An empty striking-distance list is the correct answer today, not a broken script. It will
stay empty until posts start ranking, at which point this skill becomes the main way the
target list grows.
