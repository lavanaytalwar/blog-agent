---
name: gsc-keywords
description: Mine Search Console, the keyword sheet, and Linear for new primary keywords and for secondary keywords attached to existing primaries. Use when adding secondaries to a primary, hunting new targets, or refreshing the keyword list after a GSC sync. Writes back to config/keywords.json with provenance and never proposes a keyword twice.
---

# Keyword mining

Fills `config/keywords.json` with new primaries and with up to five secondaries per
primary. Every keyword that ships carries evidence for why it exists.

The split is the same one the gates use: **the scripts are deterministic, the judgment is
yours.** Do not re-implement the SQL or move a threshold — read what the miner emits and
decide which candidates are real.

## Before you start

Read `config/keyword-history.json`. Every keyword ever proposed, accepted, rejected or
excluded is in there with a normalised fingerprint. **A keyword in that file is never
proposed again**, whatever its verdict was. This is the rule that stops the same terms
resurfacing every run.

## Procedure

**1. Refresh the data.**

```
npm run gsc:sync 90
npm run gsc:mine
```

`gsc:mine` emits two lists with evidence attached — impressions, average position, and
the date window each candidate was seen in. Add `--json` when you want to process it
rather than read it.

**2. Classify every candidate.** Four questions, in order. Any yes to the first three
disqualifies it and it goes into `config/query-noise.json`:

- **Is it Helium?** Including misspellings — `halium`, `aehlium`, `gallium`, `hilium` —
  and product names, `pulse`, `agentcy`, `ad stack`. `lib/gsc/brand.ts` catches most of
  these already; anything that slipped through belongs in the noise file, not the
  keyword list.
- **Is it another company's brand?** `unlimited design agency`, `vivid ai`,
  `xyrix pulse ai` recur every run and are already listed. New ones will appear.
- **Is it shopper intent rather than operator intent?** This is the `zudio upcoming
  sale 2026` test. Helium ranks #1 for it and converts nobody. If a merchant's *customer*
  would search it, it is not a target.
- **Does it share intent with the primary, or is it merely topically adjacent?** A
  secondary that shifts intent is a different post, not a supporting term.

**3. Expand from the sheet where GSC is silent.** `config/keywords.json` carries
`serp_competitors` for many primaries — the top-5 URLs that currently rank. Their
headings are legitimate evidence about the intent cluster even though the pages are not
ours. Mark anything sourced this way `secondary_source: "serp"`.

**4. Pull capability seeds from Linear.**

```
npm run linear:merchants
```

Three extractions, and they are not interchangeable:

- **Internal projects** — `Ad Stack`, `Core Platform`, `Agents`, `Data & Analytics`,
  `Growth` — describe what Helium ships with no merchant attached. These are the
  cleanest source of capability seeds.
- **Merchant projects** yield a **vertical**, never a name. Work for a haircare brand
  becomes `haircare ecommerce personalization`, never the brand.
- **ENG issues** carry capability detail behind a project prefix —
  `kisah: moving down if M and L size products are oos in collection page` describes
  out-of-stock suppression. Strip the prefix, keep the capability.

A capability seed is only a target if the capability is already live on gethelium.co.
That gate is unchanged from the original brief.

**5. Write back.** Update `config/keywords.json`, then record every candidate in
`config/keyword-history.json` — including the ones you rejected, with the reason.
Both files are committed, so a change in targeting shows up in a diff.

## The rule that matters most

**Never pad to five.** If Search Console, the SERP data, and Linear together produce two
secondaries for a primary, write two. If they produce none, write `[]` and set
`secondary_source: "none"`.

Inventing a keyword is the same failure as inventing a metric. Today the honest yield is
secondaries for two primaries out of twenty-four; filling the other twenty-two would mean
fabricating around a hundred terms and would make the whole file untrustworthy.

## Confidentiality

Fifty-four merchants appear in Linear and **forty of them are not publicly namable** —
Ted Baker, Sandro, Maje, Watsons, Swiss Beauty, Wrogn, BBlunt, Kisah among them.

`config/merchants.json` is the roster. `confidentialNamesIn()` in
`lib/linear/merchants.ts` fails closed against it, and gate 3 refuses any draft
containing one. Do not weaken that check, and never write a merchant name into a keyword.

## Never do these

- Assign a cluster to a new keyword. `scripts/ingest-keywords.ts` deliberately refuses to
  guess, because a wrong cluster silently breaks persona targeting. Leave it `unmapped`
  and say so.
- Mark a keyword `covered`. That is derived from posts, not asserted.
- Touch `config/claim-ledger.json`.
- Lower a threshold to produce a nicer-looking result.

## Report at the end

- Candidates seen, kept, rejected — and what changed since the last run
- Which primaries gained secondaries, and which have `none`
- New entries added to the noise file

Expect thin results. There are 181 non-brand queries in total and roughly fifteen are
genuinely minable, because Helium does not yet rank in most of the spaces it targets. An
empty striking-distance list is the correct answer today, not a broken script.
