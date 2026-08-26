# blogEO — Helium content engine

Gated blog generation for `www.gethelium.co/blogs`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the design and the reasoning behind it.

**Phase 0 is built:** schema, config, Search Console client, measurement spine.

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
| `keywords.json` | topic selection | the Google Sheet, both tabs |
| `claim-ledger.json` | gate 3 — every number a draft may state | entity-record §5, conflicts ratified 2026-08-26 |
| `blocklist.json` | gates 1, 2, 5 — competitors, hedges, CTAs, coined terms | brand-voice §6 and §8, entity-record §10 and §11 |

## Current state

- 24 usable keyword targets across 5 clusters; 4 excluded for entity-intent mismatch
- 24 ratified claims, 4 blocked pending conflict resolution (pricing, founder titles)
- 14 live posts, 3 with slug hygiene problems
- Search Console: `sc-domain:gethelium.co`, history from 2025-06-03

## Known blockers

Gate 3 refuses any draft that mentions **Ad Stack or Shopify App pricing** (₹2,000/month
vs $100/month, unreconciled) or **names a founder** (title and third-co-founder status
unconfirmed). Both unblock by editing `config/claim-ledger.json` once the facts are settled.
