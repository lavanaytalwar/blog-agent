---
name: gsc-keywords
description: Mine Search Console, the keyword sheet's SERP data, customer-language.md, and Linear for new primary keywords and for secondary keywords attached to existing primaries. New primaries can come from GSC striking distance (Helium already ranks) or be proposed by matching the existing keyword sheet's vocabulary and a capability Helium actually ships, with no ranking required. Use when adding secondaries to a primary, hunting new targets, or refreshing the keyword list after a GSC sync. Writes back to config/keywords.json with provenance on every term, and never proposes a keyword twice.
---

# Keyword mining

Fills `config/keywords.json` with new primaries and with up to five secondaries per
primary. Every keyword that ships carries evidence for why it exists.

**Three outputs from one dataset**, and they are not interchangeable:
- **Striking-distance primaries** — queries Helium ranks for but does not win (evidence: `gsc`)
- **Proposed primaries** — new keywords Helium may not rank for at all, admitted only when
  they match the vocabulary and pattern of the existing keyword sheet *and* a capability
  Helium actually ships (evidence: `proposed`)
- **Secondaries** — supporting terms for a primary that is already targeted

Striking-distance and proposed primaries answer different questions — one says "we are
already close," the other says "this fits Helium's shape even though we haven't been
measured on it" — and a run can produce either, both, or neither. Neither is a substitute
for the other, and proposed primaries are never described as evidence-backed the way a
`gsc` primary is.

The split of work is the same one the gates use: **the scripts are deterministic, the
judgment is yours.** Do not re-implement the SQL and do not move a threshold — read what
the miner emits and decide which candidates are real.

## Before you start

Read `config/keyword-history.json`. Every keyword ever proposed, accepted, rejected or
excluded is in there with a normalised fingerprint. **A keyword in that file is never
proposed again**, whatever its verdict was. This is the rule that stops the same terms
resurfacing every run.

Then read the rejection list:

```
curl -s localhost:3000/api/keywords/rejections
```

These are terms a human pressed − on in the dashboard. `npm run gsc:mine` already
subtracts them, but **tier 3 does not** — nothing stops you inventing a term someone has
already refused. Hold the list in mind before you propose anything, and check any
`proposed` term against it by fingerprint, not by string: rejecting
`ecommerce personalisation tools` also rejects `ecommerce personalization tool`.

Run `npm run keywords:rejections` at the start of the run so the rejections are folded
into `config/keyword-history.json`. After that the ledger alone is sufficient, and the
decision survives the database.

Note the run date and counts, so step 7 can diff against them.

## Procedure

### 1. Refresh the data

```
npm run gsc:sync 90
npm run gsc:mine
```

Add `--json` when you want to process the output rather than read it.

### 2. Know what was filtered out

The three lists use different bars, because they answer different questions.

| | Filter | Why |
|---|---|---|
| **Striking distance** | **10–100 impressions**, average position 11–20 | A page already ranking on page two can be pushed to page one. Below 10 impressions there is no demand to win; above position 20 a rewrite will not close the gap. |
| **Proposed primaries** | No impression filter — GSC signal is not required | The point of this lane is to reach keywords Helium hasn't been measured on yet. What gates it instead is fit, not rank: see §2a. |
| **Secondaries** | ≥2 impressions, shares ≥60% of the primary's tokens | A secondary needs evidence and shared intent, not a ranking. Position barely matters. |

All three lists exclude anything already targeted, anything in the history ledger,
anything on the rejection list, and anything matching `config/query-noise.json`.

**The impression band on striking-distance primaries is the niche test, and the ceiling is
the half that does the work.** The floor says there is demand worth winning. The ceiling
says the query is not a head term: above roughly 100 impressions in a 90-day window the
competition is established publishers, and a position-15 average there describes a page
that is outgunned rather than one revision away. The target is rank 1. A query Helium
could only reach page one of is not a target, however good the impressions look. This
ceiling applies only to the striking-distance lane — a proposed primary has no ranking to
measure in the first place, so it is judged on fit instead (§2a).

**No ceiling on secondaries, deliberately.** A secondary is a supporting term inside a
post about the primary, never something ranked for on its own, so "too competitive to
win" does not apply to it. Do not add one for symmetry.

### 2a. What makes a primary proposable

A proposed primary is not "any keyword that sounds relevant." It clears the same bar
tier-3 secondaries clear (§4), one level up, applied to a keyword that has no target post
yet:

- **Vocabulary and pattern match the sheet.** Read the existing primaries in
  `config/keywords.json` — their phrasing, their length, whether they're a question, a
  problem statement, or a capability name — and propose in the same register. A keyword
  that reads like it was pulled from a generic SEO tool rather than from this list is not
  a fit.
- **Grounded in a capability Helium ships today** — the same live-capability check used
  for the Linear seeds in step 5, not a roadmap item and not a competitor's feature. Draw
  the vocabulary from `customer-language.md` §6, the same source tier-3 secondaries
  already use.
- **Passes the same four disqualifying questions as step 3** — not Helium's own brand,
  not a competitor's brand, not shopper intent, and (since this is a new primary, not a
  secondary) genuinely distinct from an existing primary rather than a rephrasing of one,
  and not already in the history ledger or on the rejection list.

Tag it `proposed` on the primary itself, exactly as tier-3 secondaries are tagged, with an
`evidence` field naming the sheet pattern it follows and the `customer-language.md`
section it came from. It is a candidate awaiting a human decision, not a finding — never
described as evidence-backed, and never silently promoted to `gsc` without an actual
ranking behind it.

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

This ladder fills **secondaries** for primaries that already exist. For proposing **new
primaries** by fit rather than rank, see §2a instead — it reuses tier 3's evidence source
but the bar is one level higher.

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

A proposed primary (§2a) is a new top-level entry, not a secondary, and carries its own
`source` and `evidence`:

```jsonc
{
  "keyword": "how to reduce discount dependency on repeat orders",
  "cluster_id": "unmapped",
  "outline": null,
  "serp_competitors": [],
  "clean_room_top5": [],
  "push_target": "own website",
  "status": "available",
  "source": "proposed",
  "evidence": "matches sheet pattern of Sheet2 problem-led primaries; vocabulary from customer-language.md §6 problem-led set; capability: repeat-order discount logic (live)",
  "window": "2026-08-31",
  "secondary_keywords": [],
  "secondary_source": "none"
}
```

Leave `cluster_id` `unmapped` — see "Never do these" below — and do not backfill
`secondary_keywords` just because a new primary exists; run §4 for it in a later pass once
there is evidence to fill it with.

Then record **every** candidate in `config/keyword-history.json`, including the rejected
ones with their reason.

### 7. Report, and diff against the last run

- Candidates seen, kept, rejected — **and what changed since the previous run**
- New primaries added, split by lane: how many `gsc` (striking distance) vs. `proposed`
  (§2a fit-based)
- Which primaries gained secondaries; which are still `none`
- New entries added to the noise file
- Coverage by tier: how many primaries are `gsc`, `serp`, `proposed`, `none`

Growth is the point. A run that reports the same numbers as the last one is telling you
Helium's search position has not moved, which is information.

## The rule that matters most

**Never pad to five.** If Search Console, the SERP pages and Linear together produce two
secondaries for a primary, write two. If they produce none, write `[]` and
`secondary_source: "none"`.

Fabricating evidence is the same failure as inventing a metric. Today the evidence-backed
secondary yield is two primaries out of twenty-four; filling the rest by invention would
mean fabricating around a hundred terms and would make the whole file untrustworthy.

**Proposing a new primary under §2a is not the same failure**, provided it actually clears
the bar: sheet-vocabulary fit, a live capability behind it, tagged `proposed`, and visibly
not evidence-backed. What is still never allowed is dressing up a keyword that fails that
bar — wrong register, no live capability, or a rephrasing of an existing primary — to make
it look proposable, or promoting a `proposed` primary to `gsc` without an actual ranking.

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
- **Relax a threshold** to produce a nicer-looking result. The 100-impression ceiling is
  a threshold: a 400-impression query at position 14 is out, and it is out for a reason.
- **Describe a `proposed` term as evidence-backed.**
- **Re-propose anything on the rejection list**, in any surface form, at any tier. A
  rejection is a decision that was already made — re-proposing it as `proposed` because
  it was never in the ledger is the exact failure the list exists to prevent.
- **Propose a primary without a live capability behind it, or without matching the
  sheet's vocabulary.** A keyword that merely sounds relevant is not proposable — see
  §2a. If you can't name the capability and the sheet pattern it follows, don't write it.

## Expected outcome

Striking distance stays thin. There are 181 non-brand queries in total and roughly
fifteen are genuinely minable, because Helium does not yet rank in most of the spaces it
targets. An empty striking-distance list is the correct answer today, not a broken
script — it will stay sparse until posts start ranking.

Proposed primaries (§2a) are the separate channel that does not depend on ranking, so a
run can add real primaries even while striking distance is empty. That lane is bounded by
fit, not by rank: if the sheet's vocabulary and Helium's live capabilities only support
one or two new primaries this run, write one or two, not five for symmetry with anything
else. The same "never pad" discipline applies here as it does to secondaries.
