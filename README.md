# blogEO — Helium content engine

Gated blog generation for `www.gethelium.co/blogs`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the design and the reasoning behind it.

**Built:** Phase 0 (schema, config, Search Console, measurement spine),
Phase 1 (the five gates), Phase 2 (the dashboard), Phase 5 (keyword intelligence).
59 tests.

## Setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL
```

The Search Console service-account key already lives at `.secrets/gsc.json` (gitignored).
On Vercel, pass the same JSON as the `GSC_KEY_JSON` env var instead of a file path.

## Commands

| Command | What it does | Needs a database |
|---|---|---|
| `npm run gsc:probe` | Verifies GSC access, prints 28-day totals and the branded / non-brand split | no |
| `npm run sitemap:crawl` | Lists live `/blogs/` posts and flags slug hygiene problems | no |
| `npm run gsc:sync [days]` | Pulls Search Console into `gsc_snapshots` (default 30 days, upserts) | dry-runs without |
| `npm run migrate` | Applies `migrations/*.sql` | yes |
| `npm run seed` | Loads `config/*.json` into Postgres | yes |
| `npm run keywords:ingest` | Refreshes `config/keywords.json` from the Google Sheet | no |
| `npm run gsc:mine` | Striking-distance primaries and secondary candidates, with evidence | yes |
| `npm run gsc:reclassify` | Re-runs the branded/non-brand split over stored rows | yes |
| `npm run linear:merchants` | Rebuilds the merchant roster from Linear projects | no |
| `npm run keywords:secondaries` | Applies mined secondaries to the config | yes |
| `npm run gate -- <file.md>` | Runs all five gates against a draft file (`--offline` skips the live slug check) | no |
| `npm test` | 46 gate tests | no |
| `npm run status` | Row counts, branded split, keyword coverage | yes |
| `npm run dev` | Dashboard on :3000 | yes |
| `npm run seed:demo` | Creates a deliberately failing draft, for exercising the review screen | yes |
| `npm run typecheck` | `tsc --noEmit` | no |

## Getting a database

Neon free tier is enough. Create a project, copy the **pooled** connection string into
`DATABASE_URL`, then:

```bash
npm run migrate && npm run seed && npm run gsc:sync 90
```

## Config is the source of truth

The four files in `config/` are what the gates read. Postgres holds a queryable mirror,
seeded from them — never the other way round.

| File | Feeds | Derived from |
|---|---|---|
| `clusters.json` | gate 1 — cluster and persona mapping | offers §9, customer-language §1 and §6b |
| `merchants.json` | gate 3 — refuses confidential brand names | Linear projects |
| `keyword-history.json` | mining — never propose the same keyword twice | every mining run |
| `query-noise.json` | mining — recurring junk queries | every mining run |
| `keywords.json` | topic selection | the Google Sheet, both tabs |
| `claim-ledger.json` | gate 3 — every number a draft may state | entity-record §5, conflicts ratified 2026-08-26 |
| `blocklist.json` | gates 1, 2, 5 — competitors, hedges, CTAs, coined terms | brand-voice §6 and §8, entity-record §10 and §11 |

## The dashboard

`npm run dev`, then :3000. Six screens — see [DASHBOARD.md](DASHBOARD.md) for the spec.

| Route | Does |
|---|---|
| `/` | Queue: what is awaiting a decision |
| `/generate` | Pick a target, start a draft |
| `/posts` · `/posts/[id]` | History, and the review screen |
| `/keywords` | Coverage map and the remaining-target count |
| `/measurement` | The non-brand baseline and per-post readings |

Three things worth knowing:

- **Approve is impossible while any gate fails** — enforced by the API, not just a
  disabled button. If a gate is wrong, change the config and regenerate.
- **Failure evidence is highlighted inline** in the draft, anchored to the exact
  substring the rule matched.
- **Generation runs via `after()`**, continuing past the flushed response inside the
  same invocation. A once-a-minute cron sweeps up anything orphaned by a cold start.
  No queue service.

## The five gates

All five are deterministic functions over text — no model judgment anywhere. That is
what lets the drafting model change without the standards changing.

| Gate | Refuses |
|---|---|
| `strategy` | Unknown or excluded keywords, missing cluster/persona, a title with no disambiguating qualifier, a competitor brand in slug/title/H1, shopper-intent titles in the seasonal cluster |
| `structure` | Non-ASCII slugs, missing TL;DR, meta outside 140–160, keyword missing from title/H1/meta/intro, zero or multiple CTAs, long-winded prose |
| `provenance` | Numbers absent from the claim ledger, blocked claims (pricing, founder names), a real figure attributed to the wrong customer |
| `cannibalization` | Duplicate slug, a keyword an existing post already owns |
| `tone_floor` | Hedging, banned filler, hard superlatives, a missing or undefined coined term, an opening question |

`tone_floor` runs backwards from a normal safety check: it fails drafts for being timid.
Only four things stay banned outright — `guaranteed`, `#1`, `the only`, `proven to` —
because those are claims about the world rather than ways of framing one.

### Draft file format

```
---
slug: how-to-improve-revenue-per-visitor
title: ...
h1: ...
meta_description: "..."
primary_keyword: ...
cluster: conversion-rate
persona: ecommerce-leadership
---

**TL;DR** — ...
```

`content/drafts/example-revenue-per-visitor.md` is a working example that passes all five.

## Current state

- 24 usable keyword targets across 5 clusters; 4 excluded for entity-intent mismatch
- 24 ratified claims, 4 blocked pending conflict resolution (pricing, founder titles)
- 14 live posts, 3 with slug hygiene problems
- Search Console: `sc-domain:gethelium.co`, full history loaded from 2025-06-03
- Across 447 days: 1,112 branded clicks, **1 non-brand click**

## Keyword intelligence

`npm run gsc:mine` finds new primaries and secondaries; the `gsc-keywords` skill decides
which are real and writes them back. Everything that ships carries its evidence —
impressions, average position, and the window it was seen in.

Today the honest yield is **6 secondaries across 2 of 24 primaries**. The other 22 are
recorded as `secondary_source: "none"` rather than padded, because Helium does not yet
rank in those spaces. Striking distance returns zero, which is the correct answer, not a
broken script.

**Merchant confidentiality.** 54 merchants appear in Linear and only 14 are publicly
namable. `config/merchants.json` is the roster, and gate 3 fails closed against it — a
confidential brand cannot reach a draft even if it enters by some other route.

## Known blockers

Gate 3 refuses any draft that mentions **Ad Stack or Shopify App pricing** (₹2,000/month
vs $100/month, unreconciled) or **names a founder** (title and third-co-founder status
unconfirmed). Both unblock by editing `config/claim-ledger.json` once the facts are settled.
