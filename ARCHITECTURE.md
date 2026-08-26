# blogEO — Helium content engine

**Status:** design, pre-implementation
**Date:** 2026-08-26 (rev. 2 — interface moved from Discord bot to dashboard + webhook)
**Scope:** generator only. The audit half of the original design is explicitly deferred — see §2.

---

## 1. What this is

A blog generation engine for `www.gethelium.co/blogs`, driven from a web dashboard. On
demand it selects a target keyword, drafts a post in Helium's voice, runs five deterministic
quality gates, and renders the draft alongside its gate report for review. Approval writes a
markdown file for a human to paste into the CMS, and a Discord webhook announces it in `#seo`.

It also runs a nightly Search Console sync so that every post published from today forward
has a measurable before-and-after.

**The agent never writes to the live site.** Publishing is a human action. A server-side
handler exists as a stub for later.

---

## 2. Starting condition — why this differs from the system it's modelled on

Measured from GSC on 2026-08-26, trailing 90 days:

| | Impressions | Clicks |
|---|---|---|
| Branded queries | 9,754 | 468 |
| Non-brand queries | 236 | **0** |

- Non-brand clicks in 90 days: **zero**
- Non-brand queries at position 5–20 with ≥10 impressions: **zero**
- 14 posts live at `/blogs`; 12 produce negligible impressions
- The one high-impression post (`/blogs/d2c-apparel-calendar-2026`, 1,511 imp / 5 clicks)
  ranks for consumer retail-sale queries — `zudio upcoming sale 2026`, `dior sale 2026`,
  `end of season sale date`. Wrong audience; those impressions are not an opportunity.
- GSC history begins 2025-06-03 (~15 months). API ceiling is 16 months.

Three consequences that shape everything below:

1. **No audit component.** There is no CTR headroom, no page-two content to push, and no
   regression to recover. An auditor would have nothing to rank. Revisit once non-brand
   rankings exist.
2. **GSC cannot drive topic selection.** Striking-distance discovery returns an empty set.
   Topic selection runs on the curated keyword sheet and its SERP competitor data. The GSC
   discovery path is written but dormant, and activates automatically once it returns rows.
3. **GSC is a measurement system, not a discovery system** — for now.

The upside: a baseline of literally zero non-brand clicks means any non-brand click this
engine ever produces is unambiguously attributable to it.

---

## 3. Flow

```text
Generate <topic|keyword>   (dashboard, on demand)
        │
        ├── topic selection ──── keywords table ← keyword sheet
        │                        cannibalization check ← posts + live sitemap
        │                        cluster + persona mapping
        │
        ├── research ─────────── SERP competitor URLs (sheet tab 1)
        │                        Helium evidence corpus (claim ledger)
        │
        ├── draft ────────────── helium-writing skill (brand-voice.md)
        │
        ├── gates (deterministic, in code) ─── fail → redraft (max 2) → stop
        │      1 strategy   2 structure   3 claim provenance
        │      4 cannibalization          5 tone floor
        │
        └── dashboard review ────── [Approve] → markdown file + Discord ping in #seo
                                    [Discard] → recorded, no file
                                             │
                        nightly cron ────────┴── GSC sync → measurement at +28d / +56d
```

---

## 4. Components

### 4.1 Topic selection

Sources, in priority order:

| Source | Status | Notes |
|---|---|---|
| Manual request | active | dashboard: keyword picker or free-text topic |
| Curated keyword sheet | active | primary engine — see §5.1 |
| GSC striking distance | **dormant** | code present; yields nothing today, self-activates when it returns rows |
| Linear | phase 5 | shipped capabilities as story seeds, gated on being live on gethelium.co |

Selection rejects a keyword when: an existing post already targets it (§4.3 gate 4), the
keyword has no cluster/persona mapping, or it is on the entity-mismatch list.

**Entity-mismatch list.** Two keywords in the sheet are unwinnable and must never be
targeted: `helium recommendations` (SERP is helium the gas) and `Helium AI` (SERP belongs
to a different company at ai.helium.com). `helium ecommerce` is contested by `gethelium.com`,
a different company on a near-identical domain — allowed but flagged.

### 4.2 Drafting

Three units, mirroring the reference architecture:

- **`seo-strategy`** — chooses the keyword, validates cluster and persona, assembles the
  brief including SERP competitor coverage from sheet tab 1.
- **`helium-writing`** — composes the draft. Voice rules come from `brand-voice.md`;
  claims come from the ledger; terminology from `entity-record.md` §10.
- **pipeline** — orchestrates. Contains no writing rules of its own.

### 4.3 The five gates

All five are **deterministic code**, not model judgment. This is deliberate: it means
swapping the drafting model changes output quality but can never change what passes.

**Gate 1 — Strategy**
- primary keyword resolves to an approved keyword record
- cluster and persona both mapped
- title and H1 each contain at least one required qualifier: `Shopify` · `D2C` ·
  `ecommerce` · `personalization` (source: `entity-record.md` §1 disambiguation)
- no blocked competitor in slug, title, or H1 (§5.3)

**Gate 2 — Structure**
- opens with a labelled TL;DR
- slug is ASCII, lowercase, hyphen-separated, no periods, no encoded characters
  *(three live posts violate this today — see §9)*
- meta description present, 140–160 chars
- exactly one CTA, drawn from the approved set in `offers.md` §8
- at least one H2; primary keyword present in title, H1, meta, and first 100 words
- majority of sentences under 15 words (`brand-voice.md` §9)

**Gate 3 — Claim provenance**
- every numeric claim must match a record in the claim ledger (§5.2)
- any digit-bearing claim with no ledger match fails the draft
- no customer name outside the approved public set
- **any mention of price fails** until conflict #10 is reconciled (§8)
- **no founder name** until conflicts #11 and #12 are resolved (§8)

**Gate 4 — Cannibalization**
- primary keyword not already targeted by a post in `posts`
- slug unique against `posts` and against the live `/blogs` sitemap
- if an existing post covers the topic, the run stops and reports which post

**Gate 5 — Tone floor** *(Helium-specific; runs opposite to a normal safety check)*
- hedge blocklist fails the draft: `could help`, `may improve`, `might`,
  `designed to potentially`, `some merchants`, `arguably`, `in some cases`
  (source: `brand-voice.md` §6 bans hedges outright)
- banned-phrase blocklist: `revolutionary`, `cutting-edge`, `seamless`,
  `unlock the power of`, `in today's fast-paced`
- at least one coined term used and defined in one clause (`entity-record.md` §10)
- intro must open on an outcome or contrast, not a question
- hard superlative ban: `guaranteed`, `#1`, `the only`, `proven to` — these are claims
  about the world, not framing

**Redraft policy:** two attempts on failure, then stop and report. No unbounded loops.

### 4.4 Interface — dashboard, with Discord as notifier

**Why not a Discord bot.** Discord caps message content at 2,000 characters and embeds at
4,096 in the description. A 1,200-word post is 7,000+ characters, so the artifact under
review physically cannot render in a Discord message — approval would mean downloading a
`.md`, reading it elsewhere, and coming back to click a button. On top of that, drafts are
generated on demand rather than on a schedule, which removes the push-notification benefit
that justifies a chat-first interface in the first place.

**Dashboard** (Next.js on Vercel, same deployment):

| View | Purpose |
|---|---|
| Generate | keyword picker (from `keywords`) or free-text topic; kicks off a job |
| Draft | rendered post beside its gate report, failing rules highlighted inline |
| Decision | Approve → writes `content/drafts/{slug}.md`; Discard → recorded, no file |
| History | every post, status, gate outcomes, who decided and when |
| Measurement | non-brand impressions/clicks per post at +28 / +56 days vs blog-wide baseline |
| Keywords | coverage map — which sheet keywords have a post, which are untouched |

**Discord** is a one-way channel webhook. No bot, no application, no signature verification,
no 3-second interaction deadline, no follow-up token window. It posts one line when a draft
is ready or approved:

```
Draft ready — "How to increase revenue per visitor" — 5/5 gates passed → <link>
```

**Long-running work.** Generation exceeds a serverless request, so `/api/generate` enqueues
a `jobs` row and returns immediately; a worker function drains the queue and the dashboard
polls for status. A returning Vercel function is killed along with anything still running
inside it, so work is never left in a dangling promise.

**Auth.** Vercel deployment protection (confirmed Pro) — the whole deployment sits behind
the Vercel team login, zero application code. Every decision records the actor, so per-user
permissions later are a config change, not a migration.

### 4.5 Measurement

Nightly cron pulls GSC into `gsc_snapshots` at site and page level, split branded vs
non-brand by regex on the query.

Every published post gets readings at **+28** and **+56 days**, each stored alongside a
**blog-wide baseline for the identical date range** — without the control, a reading only
tells you the site changed, not that the post worked.

Given the zero baseline, headline metrics are leading indicators, not clicks:

- count of non-brand queries with any impression (today: 69, mostly noise)
- count of target keywords from the sheet with any ranking at all (today: ~0)
- non-brand impressions and clicks per published post
- blog-wide non-brand click total (today: 0)

Clicks are the goal; they are not the near-term signal. Expect 2–3 months before anything
moves. A system judged on six-week click growth will look like it is failing while doing
exactly the right thing.

---

## 5. Configuration — the files the gates read

### 5.1 `config/keywords.json`
Ingested from the Google Sheet (`1NSLIqpO2W4GmTK3ZxiEPTD0KNNbdN3iyljzeVFtpxEY`).

- **tab "Sheet2"** → keyword, section outline, distribution target
- **tab "Keyword Strategy"** → keyword, outline, top-5 SERP URLs, clean-room comparison
  URLs. The SERP URLs are the input to coverage analysis: does our draft cover what the
  ranking pages cover?

Each record carries: `keyword`, `cluster`, `persona`, `outline`, `serp_competitors[]`,
`status`, `entity_risk`.

### 5.2 `config/claim-ledger.json`
Generated from `entity-record.md` §5, which already states the rule: *"Use these numbers
and only these numbers. Anything not listed here needs a source before it ships."*

Ratified values (2026-08-26):

| Claim | Value |
|---|---|
| Platform trio | 30% higher conversion · 18% higher AOV · 20% better retention |
| Brands served | 100+ |
| Revenue generated | ₹45 crore+ |
| Akiso | +31% CVR, +17% AOV |
| Sudathi | 25% CVR uplift · 5× CAC reduction · Meta ROAS 5×→10× |
| W for Woman | +27% revenue per visit in 4 weeks |
| Lifelong | CVR up to ~40% in the Valentine window (~0.5% → ~0.7%) |
| Pulse | +27% funnel fix rates · ~80% less analyst investigation time |
| Attribution | +20% ROAS in 30 days |
| Mechanism | 40+ site-level signals · ~20 variables per visitor |
| Onboarding | one-click Shopify · ~2-min script · personalization begins in 15 days |
| Agentcy | 1,140,000+ creatives · 2,300+ brands · first pack <1–4 min |

The impulse backend (`impulse-backend.heliumbuilder.com`) becomes a second ledger source
once its auth and endpoints are documented. It is not required for v1.

### 5.3 `config/blocklist.json`
Two tiers, because `brand-voice.md` §8 distinguishes them:

- **Banned from slug/title/H1:** Nosto, Dynamic Yield, Rebuy, Unbxd, Algolia, Klevu,
  Searchspring, Anchanto
- **Approved contrast targets** (naming these is on-brand): GA4, Microsoft Clarity,
  agencies, UGC shops. Never attack a named competitor's brand directly.

Plus the phrase blocklists from Gate 5, and the unapproved-customer-name rule.

### 5.4 `config/clusters.json`
Not yet written. Derived from the Key Problem taxonomy in `offers.md` §9 — Conversion
rates · AOV improvement · Marketing efficiency · AI product tagging — and the two working
content engines identified in `customer-language.md` §6b: diagnostic/mechanism posts, and
Indian festive/seasonal playbooks. Personas come from `customer-language.md` §1.

**This file must be authored and approved before Gate 1 can pass anything.**

---

## 6. Data model — Neon Postgres

```
keywords          keyword, cluster, persona, outline, serp_competitors[], status, entity_risk
clusters          name, description, personas[], example_titles[]
claim_ledger      claim_key, value, source_ref, tier, ratified_at
posts             slug, title, primary_keyword, cluster, persona, status,
                  body_md, gate_report, model, created_at, approved_by, approved_at,
                  published_url, published_at
gate_results      post_id, gate, passed, failures[], run_index
gsc_snapshots     date, dimension(site|page|query), key, clicks, impressions, ctr,
                  position, is_branded
measurements      post_id, window_label(publish|d28|d56), captured_at,
                  post_clicks, post_impressions, post_position,
                  blogwide_clicks, blogwide_impressions
jobs              type, payload, status, attempts, started_at, finished_at, error
decisions         post_id, actor, action, created_at
```

`posts.status`: `drafted → gated → awaiting_approval → approved → published → measured`,
plus terminal `discarded` and `failed_gates`.

---

## 7. Repo & deployment

```
app/
  (dashboard)/                         generate · draft · decision · history · measurement
  api/generate/route.ts                enqueues a draft job
  api/posts/[id]/decision/route.ts     approve | discard
  api/cron/gsc-sync/route.ts           nightly
  api/cron/measure/route.ts            nightly, +28/+56 readings
  api/worker/route.ts                  drains jobs
lib/
  llm/          provider abstraction — anthropic | ollama
  gates/        one pure function per gate, fully unit-tested
  gsc/          service-account JWT auth + search analytics client
  notify/       Discord channel-webhook post
  db/
config/         keywords · claim-ledger · blocklist · clusters
content/drafts/ approved markdown output
migrations/
scripts/        sheet ingest, ledger build, sitemap crawl
```

- **Host:** Vercel. **DB:** Neon.
- **Cron:** nightly GSC sync + measurement. No scheduled draft job — drafts are on demand.
- **Models:** Sonnet 5 for drafting and topic reasoning, behind `lib/llm`. Ollama Cloud is
  a config swap. Prompts avoid provider-specific behaviour so the swap is real.
- **Secrets:** `.secrets/gsc.json` locally (gitignored), Vercel env vars in deployment.
  The current GSC key was exposed in a chat transcript and should be rotated before
  production.

**GSC connection is live and verified:** service account `blog-eo@decent-answer-506707-k3`,
property `sc-domain:gethelium.co`, permission `siteFullUser`.

---

## 8. Ratified decisions and remaining conflicts

Resolved 2026-08-26 (from `entity-record.md` §6):

| # | Decision |
|---|---|
| 1 | Brands served: **100+** |
| 2 | Revenue: **₹45 crore+**, currency always explicit |
| 3 | Akiso: **+31% CVR / +17% AOV** (the conservative figure, by explicit instruction) |
| 4 | Sudathi: **case-study figures** |
| 5 | Module naming: **current live names** — Merchandising, Pulse, Ad Stack — because they match clickable URLs |
| 6 | Spelling: **-ize** |
| 8 | ROAS window: **30 days** |
| 13 | Founded: **2023** |

Still open, and gated shut until resolved:

| # | Conflict | Effect |
|---|---|---|
| 10 | ₹2,000/mo (site) vs $100/mo (Shopify App Store) | Gate 3 fails any draft mentioning price |
| 11 | Shray Arora's title | Gate 3 fails any draft naming a founder |
| 12 | Deepak Kapoor's status | as above |

---

## 9. Known live issues (not this system's job, but it will keep flagging them)

- **Three slugs contain encoded curly apostrophes**, and one contains a period:
  `/blogs/why-product-recommendations-don%E2%80%99t-convert`,
  `/blogs/real-time-personalization-vs.-segmentation-what%E2%80%99s-the-difference`,
  `/blogs/valentine%E2%80%99s-day-2026-...` — needs redirects.
- **Duplicate content is live and measured.** Substack posts at `blog.gethelium.co/p/*`
  are indexed alongside their `www/blogs/*` twins and both draw impressions.
- **Third and fourth blog surfaces** exist at `content.gethelium.co` and
  `www.gethelium.co/blog-1`.
- **Entity collision is costing traffic:** `helium ai` draws 1,334 impressions at
  position 4.1 against a different company of the same name.

---

## 10. Build order

| Phase | Deliverable | Blocked by |
|---|---|---|
| 0 | Schema, config ingest (sheet → keywords, entity-record → ledger), GSC sync, measurement spine | — |
| 1 | Five gates as pure functions + unit tests | `clusters.json` authored |
| 2 | Dashboard: generate · draft view · gate report · approve → markdown · history | phase 0 |
| 3 | Draft pipeline, `seo-strategy` + `helium-writing` skills | phase 1 |
| 4 | Discord webhook notifier · measurement views on the dashboard | channel webhook URL |
| 5 | Stubs: auto-publish handler, Linear topic source, GSC striking-distance activation | — |

Phase 0 starts immediately and is the piece that is unrecoverable if deferred — the
measurement baseline can only be captured going forward.

---

## 11. Out of scope

Auto-publishing · Medium/Reddit syndication · the blog-surface consolidation decision ·
AEO citation tracking (no data source without SEMrush) · the audit/edit engine ·
an About page · comparison pages.
