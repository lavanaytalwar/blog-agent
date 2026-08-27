# blogEO — Helium content engine

**Status:** built and running. Phases 0, 1, 2, 3 and 5 are in `main`; phase 4 (Discord) is not.
**Date:** 2026-08-26 (rev. 4: multi-keyword posts, SERP reading, the voice rules)
**Scope:** generator only. The audit half of the original design is explicitly deferred, see §2.

---

## 1. What this is

A blog generation engine for `www.gethelium.co/blogs`, driven from a web dashboard. On
demand it takes a **selection** of target keywords, measures the pages currently outranking
us for them, drafts a post in Helium's voice against what that measurement showed, runs five
deterministic quality gates, and renders the draft alongside its gate report for review. Approval writes a
markdown file for a human to paste into the CMS, and a Discord webhook announces it in `#seo`.

It also runs a nightly Search Console sync so that every post published from today forward
has a measurable before-and-after.

**The agent never writes to the live site.** Publishing is a human action. A server-side
handler exists as a stub for later.

---

## 2. Starting condition — why this differs from the system it's modelled on

Measured from GSC on 2026-08-26:

| Trailing 90 days | Impressions | Clicks |
|---|---|---|
| Branded queries | 9,754 | 468 |
| Non-brand queries | 236 | **0** |

| Full history (2025-06-03 to 2026-08-23) | Queries | Impressions | Clicks |
|---|---|---|---|
| All queries | 479 | 23,373 | 1,113 |
| Non-brand | 181 | 998 | **0** |

Across the whole 447 days there is **one** non-brand query at position 11 to 20 with 10 or
more impressions, and 83 non-brand queries clear even a 2-impression bar. The top of the
non-brand list is mostly noise (`unlimited design agency`, `#socialbutterfly`); two of the
top twelve are genuinely Helium's category.

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
Generate <lead keyword> [+ same-cluster keywords]   (dashboard, on demand)
        │
        ├── selection ────────── keywords table ← keyword sheet
        │                        one cluster for the whole selection
        │                        cannibalization check ← posts + live sitemap
        │                        cluster + persona mapping
        │
        ├── SERP reading ─────── top 6 organic results (search API, or URLs supplied)
        │      (§4.2c)           fetch + measure each: words, H2s, date, schema,
        │                        tables, questions, citations, intro length
        │                        classify article | listing | product | other
        │                        → word target = median of the WRITTEN pages
        │                        cached in config/serp-analysis.json
        │
        ├── brief ────────────── assembleBrief: deterministic, no model
        │                        cluster · persona · secondaries · claim ledger
        │                        · namable customers · voice · SERP lesson
        │
        ├── draft ────────────── one model call. renderSystemPrompt(brief)
        │                        prompt renders from lib/gates/rules.ts, so no
        │                        gate can enforce a rule the writer was not told
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
| Manual request | active | dashboard: a lead keyword plus checkboxes for other untouched keywords in the same cluster (§4.2b) |
| Curated keyword sheet | active | primary engine — see §5.1 |
| GSC striking distance | **dormant** | code present; yields nothing today, self-activates when it returns rows |
| Linear | **active** | capability seeds from internal projects; vertical signal from merchant projects. See §4.6 |

Selection rejects a keyword when: an existing post already targets it (§4.3 gate 4), the
keyword has no cluster/persona mapping, or it is on the entity-mismatch list.

**Entity-mismatch list.** Two keywords in the sheet are unwinnable and must never be
targeted: `helium recommendations` (SERP is helium the gas) and `Helium AI` (SERP belongs
to a different company at ai.helium.com). `helium ecommerce` is contested by `gethelium.com`,
a different company on a near-identical domain — allowed but flagged.

### 4.6 Keyword intelligence

Topic selection is only as good as the target list, and the sheet holds 24 usable
keywords — roughly three months of output. Resupply comes from three sources, in
descending order of trust, run by a skill (§6).

| Source | Yields | Trust |
|---|---|---|
| **Search Console** | striking-distance primaries; secondaries with real impressions | highest — the candidate carries its own evidence |
| **Sheet expansion** | related terms from the top-5 SERP URLs tab 1 records per keyword | those pages rank; what they cover is evidence about the intent cluster |
| **Linear** | capability seeds from internal projects; verticals from merchant projects | seeds only — never a keyword on its own |

**What Search Console can actually supply.** Of 217 non-brand queries, roughly 15–20
are genuinely minable and they cluster almost entirely around personalization. It can
supply secondaries for three or four primaries. For the rest it holds nothing, because
Helium does not rank in those spaces. The skill records `secondary_source: "none"`
rather than padding to a count — inventing keywords is the same failure as inventing a
metric.

**Linear, split three ways.** The 64 projects divide into 10 internal (`Ad Stack`,
`Core Platform`, `Agents`, `Data & Analytics`, `Growth`) and 54 merchants. Only ~13
merchants are on the approved public list; the other ~41 — Ted Baker, Sandro, Maje,
Watsons, Swiss Beauty, Wrogn, BBlunt, Kisah among them — are confidential.

- Internal projects and their issues → capability seeds. No client name is present, so
  nothing has to be stripped.
- Merchant projects → a brand-to-vertical map in `config/merchants.json`. The name never
  leaves that file; only the vertical does.
- ENG issues → capability detail, after the project prefix is removed.

**The extractor fails closed.** Because the merchant roster is known and complete, any
token matching a project name is refused unless that exact name is on the approved
public list. This is a deterministic check, not a judgment the model re-makes each run.

**Never propose the same keyword twice.** Every keyword ever proposed, accepted,
rejected, or excluded keeps a normalised fingerprint in `config/keyword-history.json`
— lowercased, hyphens stripped, British/American spelling folded, singularised, tokens
sorted. So `ecommerce personalization`, `e-commerce personalisation`, and
`personalization for ecommerce` collapse to one entry. Rejected candidates carry their
reason and never resurface.

One distinction matters: those variants are blocked as separate **primaries** and
allowed as **secondaries** of one primary. Folding without that distinction would throw
away the exact terms the mining exists to collect.

**Secondary keywords.** Every primary carries up to five, each with the evidence tier,
source, and where applicable the impressions, average position and date window it came from.
72 secondaries exist across 22 of the 24 usable primaries; 6 are GSC-backed, the rest come
from SERP headings and the brand corpus. The evidence ladder is `gsc` → `serp` → `proposed`
→ `none`, and it records why a term is on the list without gating on it. GSC impressions are
**not** an admission test: with 998 non-brand impressions in 447 days, that test would reject
every keyword worth writing about (§2).

**Keyword budget.** The original brief said primary four to five times, secondaries four to
five combined. Both numbers turned out to be arithmetic that correct writing could not
satisfy, and both are now rates that scale with length. See §4.3 gate 2.

### 4.2 Drafting

Three units. The reference architecture called them skills; here two of the three are
plain code, because nothing about them needs judgment.

- **`lib/brief/assemble.ts`** — turns the selection into a complete spec: cluster, persona,
  secondaries, keyword budget, every number the post may state, the customers it may name,
  the voice rules, the SERP lesson, the word target. No model is involved. If the brief is
  wrong it is wrong the same way every time, which is the only kind of wrong worth debugging.
- **`lib/brief/render.ts`** — turns that spec into the system prompt. Voice from
  `brand-voice.md`, claims from the ledger, terminology from `entity-record.md` §10.
- **`lib/draft/pipeline.ts`** — one model call, then parse. Contains no writing rules.

**`lib/gates/rules.ts` is the anti-drift mechanism.** Every mechanically-enforced rule is
stated once in one table. The gates take their rule ids from it and the prompt is rendered
from it, so a rule cannot exist in a gate without the writer being told about it. Five real
generations failed on rules the prompt never mentioned, `keyword.h1` among them, which is
drift rather than a model problem. Two tests assert the two cannot diverge.

The writing surface itself is a skill, `.claude/skills/write-blog`, whose entire interface
is two lines: the keywords, and optionally one line of angle.

### 4.2b One post, several targets

A post is generated for a **selection** of keywords, not a single one. The
dashboard offers a lead keyword and then checkboxes for the other untouched
keywords in the same cluster.

- The **lead** owns the slug, title, H1, meta description and first 100 words.
- Every **additional** target is enforced exactly like the lead everywhere else:
  its own H2, at least three uses, and its secondary keywords required.
- The length floor rises 1,500 characters per additional target, and the combined
  secondary budget rises with it.
- The selection is stored in `posts.additional_keywords` and re-validated
  against `config/` on every gate run, so a re-ingest can never silently change
  what a published post claimed.
- The selection is a fact about the **request**. The pipeline overwrites
  whatever the model echoed in the front matter before gating, so the model has
  no vote in what it is judged against.

Everything outside the selection stays foreign: `keyword.foreign` allows one
passing mention and no more. This is what stops two posts chasing one query.

### 4.2c Reading the SERP before writing

Before a draft, the pages currently ranking for the keyword are fetched and
**measured**: word count, H2 count, publish or modified date, schema types,
lists, tables, question-shaped headings, outbound citations, and words before
the first H2. Each page is classified article / listing / product / other, and
the lesson is computed over the written pages only, so an app-store listing
cannot drag the median.

No model reads those pages. A model asked "why does this rank" produces a
confident essay, which is what the gates exist to reject. Shape is countable.

Two things come out of it:

- **The word target tracks the measured median**, replacing the flat 700 to 1,200
  default. `ugc ads` measures a median of 9,254 characters across the written pages in its
  top 6, so its target is 1,741 to 2,263 words. This is guidance in the prompt and nothing
  more: no draft is failed for missing it.
- **The observations go into the prompt verbatim**, under an instruction not to copy
  the shape.

**The enforced length floor does not depend on the SERP.** A revision of this document
argued the opposite, on the grounds that `config/serp-analysis.json` is a committed file
like `keywords.json` and therefore deterministic. That is true and it was not the whole
objection. A gate is the fixed standard a draft is held to. Once its threshold is a
function of whichever six pages ranked the last time someone ran a script, two drafts of
identical quality get different verdicts because a measurement was or was not refreshed.
The floor is flat: 3,000 characters of prose, plus 1,500 per additional target.

Nothing in `lib/gates` imports from `lib/serp`, and a test asserts it. The independence is
structural rather than a convention, so a gate cannot come to depend on the SERP again by
accident.

**Why characters rather than words.** A word count depends on how you split it, and a draft
can pad its way to a word target with short filler while saying less. Characters are counted
the same way on their pages and on ours. 3,000 is roughly the 500 words this floor has
always been.

Search is pluggable, `APIFY_TOKEN`, `BRAVE_SEARCH_KEY` or `SERPER_API_KEY`, checked in that
order, and this codebase never scrapes an engine's results page itself. Not out of
squeamishness: Google blocks datacenter IP ranges, which is exactly what Vercel serverless
egress is, so a direct scrape would fail on roughly the first request and break again
whenever the markup changed. All three providers exist because they run the proxy
infrastructure that makes it work.

Note the division of labour. The provider answers one question, *which six URLs rank*, and
nothing else. Fetching those pages is a plain `fetch()` in `lib/serp/analyze.ts` with no key
involved, and reading them is arithmetic. A model may legitimately choose the URLs, because
what happens to them afterwards is deterministic; a model may not decide why they rank.

With no key the URLs are passed on the command line and the cache records
`source: supplied`, so a hand-fed or sheet-derived reading is never mistaken for a live one.
Cached in `config/serp-analysis.json` with the date taken.

### 4.3 The five gates

All five are **deterministic code**, not model judgment. This is deliberate: it means
swapping the drafting model changes output quality but can never change what passes.

**Gate 1 — Strategy**
- every selected keyword resolves to an approved keyword record
- all selected keywords share one cluster (`cluster.targets_agree`) — the persona,
  the commercial URL and the audience guard all hang off the cluster, so a
  cross-cluster selection has no single correct answer and must be split
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
- at least one H2; lead keyword present in title, H1, meta, and first 100 words
- each additional selected keyword has an H2 containing it and at least three uses
  (`keyword.additional_unheaded`, `keyword.additional_underused`)
- length in **characters of prose**: a flat floor of 3,000, plus 1,500 per additional
  target. Deliberately independent of the SERP (§4.2c). The floor is carried on the
  brief from the gate's own constant, so the number the writer is given and the number
  the gate checks cannot drift apart. There is no ceiling: the only principled one was
  a multiple of the SERP median
- primary keyword used at least 3 times and at most one per 100 words, capped at 8.
  Expressed in occurrences rather than word-share: standard keyword density,
  (keyword words x uses) / total words, scores a five-word long-tail phrase at 4.5%
  purely for being five words long
- secondaries at most 2 per 100 words combined, and no single secondary more than
  `words/200` (4 to 10) times (`keyword.secondary_repeated`). There used to be a flat
  combined ceiling of 16, derived from 700 to 900-word drafts, which became the binding
  constraint at every length above about 800 and stopped the rate cap from ever running.
  A combined count cannot tell stuffing from length; one term repeated is what stuffing
  actually looks like
- majority of sentences under 15 words (`brand-voice.md` §9)

**Gate 3 — Claim provenance**
- every numeric claim must match a record in the claim ledger (§5.2)
- any digit-bearing claim with no ledger match fails the draft
- no customer name outside the approved public set
- **any mention of price fails** until conflict #10 is reconciled (§8)
- **no founder name** until conflicts #11 and #12 are resolved (§8)

**Gate 4 — Cannibalization**
- no selected keyword — lead or additional — already targeted by a post in `posts`
- no keyword outside the selection used more than once (`keyword.foreign`)
- slug unique against `posts` and against the live `/blogs` sitemap
- if an existing post covers the topic, the run stops and reports which post

**Gate 5 — Tone floor** *(Helium-specific; runs opposite to a normal safety check)*
- **no em dash, en dash or double hyphen anywhere**, title and meta included
  (`tone.em_dash`). Nothing is wrong with the mark; it is banned because almost
  nobody types one and a page full of them is the loudest signal that a machine
  wrote the copy. The system prompt is held to the same rule, with a test
  asserting it, because a model shown forty dashes will write them.
- **at least one informal break per six sentences** (`tone.too_polished`): a
  sentence opening on a conjunction, a clipped fragment, a trailing ellipsis, or
  an aside in parentheses. Prose where every sentence is correctly closed reads
  like a template. This is informal punctuation, never introduced errors.
- hedge blocklist fails the draft: `could help`, `may improve`, `might`,
  `designed to potentially`, `some merchants`, `arguably`, `in some cases`
  (source: `brand-voice.md` §6 bans hedges outright)
- banned-phrase blocklist: `revolutionary`, `cutting-edge`, `seamless`,
  `unlock the power of`, `in today's fast-paced`
- at least one coined term used and defined in one clause (`entity-record.md` §10)
- intro must open on an outcome or contrast, not a question
- hard superlative ban: `guaranteed`, `#1`, `the only`, `proven to` — these are claims
  about the world, not framing

Storytelling is required by the prompt but not gated: one thread through the post, opening
in a scene, namable customers as the characters. It is not mechanically checkable, and a
gate that needs a model to judge it would be a model judging a model.

**Redraft policy:** two attempts on failure, then stop and report. No unbounded loops. The
failing rule ids are passed forward in the note, because the writer responds far better to
`tone.coined_term_undefined: define session velocity in the sentence you first use it` than
to "make it better". If the same rule fails twice the problem is the prompt or the gate, not
the model.

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
| Generate | a lead keyword from `keywords`, checkboxes for other untouched keywords in the same cluster, persona; kicks off a draft via `after()` |
| Draft | rendered post beside its gate report, failing rules highlighted inline |
| Decision | Approve → records the decision and offers the markdown for download; Discard → recorded |
| History | every post, status, gate outcomes, who decided and when |
| Measurement | non-brand impressions/clicks per post at +28 / +56 days vs blog-wide baseline |
| Keywords | coverage map — which sheet keywords have a post, which are untouched; GSC mining button |

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

Each record carries: `keyword`, `cluster_id`, `outline`, `serp_competitors[]`,
`clean_room_top5[]`, `status`, `entity_risk`, `source`, `secondary_source`, and
`secondary_keywords[]` (each with `keyword`, `source`, `evidence`, and where the term came
from GSC, its `impressions`, `position` and date `window`).

### 5.1b `config/serp-analysis.json` and `config/serp-headings.json`

Written by `npm run serp:analyze` and `npm run serp:headings`. Cached rather than fetched per
draft: six HTTP requests per generation would make every run slow and flaky, and a SERP moves
in weeks rather than minutes.

`serp-analysis.json` holds, per keyword, the date the reading was taken, its `source`
(`search` | `supplied` | `sheet`), the per-page measurements, and the derived lesson. The
`source` field exists so a sheet-derived or hand-fed reading is never silently mistaken for a
live SERP. `serp-headings.json` holds the older, narrower extraction: H1 to H3 text only,
used for the "what the ranking pages cover" section and as tier 2 of the evidence ladder.

Neither is read by a gate. They shape the prompt; they never decide what passes.

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

### 5.4 `config/merchants.json`
Generated from Linear projects. Every merchant, its vertical, and whether it is publicly
namable. Doubles as the vertical lookup and the leak-prevention list — gate 3 checks
customer names against it, so a confidential brand cannot reach a draft even if it
enters by some other route.

### 5.5 `config/keyword-history.json`
The permanent seen-set described in §4.6. Committed, so the memory survives the database.

### 5.6 `config/query-noise.json`
Recurring junk from Search Console — other companies' brands (`unlimited design agency`,
`vivid ai`, `xyrix pulse ai`) and shopper-intent queries. Appended to by each mining run
so the next one starts from what previous runs already ruled out.

### 5.7 `config/clusters.json`
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
posts             slug, title, h1, meta_description,
                  primary_keyword, additional_keywords[], cluster_id, persona_id,
                  status, body_md, gate_report, model, attempt, created_at,
                  approved_at, published_url, published_at
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

`posts.additional_keywords` is a plain `text[]`, deliberately not a join table with a foreign
key into `keywords`. The keyword list is versioned in `config/` and re-ingested from the
sheet, and a foreign key would let a re-ingest fail or cascade against posts that are already
published. The gates re-validate every target against `config/` on each run, which is the
check that actually matters.

---

## 7. Repo & deployment

```
app/
  page.tsx                             queue: what is awaiting a decision
  generate/                            lead keyword + also-cover picker + persona
  posts/ · posts/[id]/                 history, review screen, gate report
  keywords/ · measurement/             coverage map, non-brand baseline
  api/generate/route.ts                creates the post row, drafts via after()
  api/posts/[id]/decision/route.ts     approve | discard | regenerate
  api/posts/[id]/markdown/route.ts     the approved post as a downloadable file
  api/keywords/mine/route.ts           GSC mining from the dashboard
  api/cron/gsc-sync · measure · drain  nightly
lib/
  brief/        assemble (deterministic spec) · render (system prompt) · serp (caches)
  gates/        one pure function per gate + rules.ts, the single rule table
  serp/         analyze (measure a ranking page) · search (pluggable provider)
  draft/        pipeline (brief in, prose out) · source (seam) · run (post row)
  llm/          provider abstraction: anthropic | ollama
  gsc/          service-account JWT auth, search analytics client, mining
  keywords/     fingerprinting and the permanent seen-set
  linear/       merchant roster, fails closed on confidentiality
  config/ data/ notify/ db/
.claude/skills/
  write-blog/   the two-line writing interface
  gsc-keywords/ keyword mining procedure and evidence ladder
config/         keywords · claim-ledger · blocklist · clusters · merchants ·
                keyword-history · query-noise · serp-analysis · serp-headings
content/drafts/ approved markdown output
migrations/ · scripts/
```

The full command surface (ingest, mining, SERP reading, drafting, gating) is a table in
`README.md` rather than duplicated here; this document describes what the pieces are for.

- **Host:** Vercel. **DB:** Neon.
- **Cron:** nightly GSC sync + measurement. No scheduled draft job — drafts are on demand.
- **Models:** GLM-5.2 on Ollama Cloud at `think: max`, behind `lib/llm`. Anthropic is a
  config swap; prompts avoid provider-specific behaviour so the swap is real. Max reasoning
  was measured rather than assumed: on the same question it produced 3,898 characters of
  reasoning and 1,367 eval tokens against high's 2,170 and 747, and it flipped the one
  keyword that had been failing a five-draft batch. The brief carries thirty-odd
  simultaneous constraints, so roughly double the tokens is worth it.
- **A keyless deployment produces obviously placeholder drafts** rather than failing every
  generation: `getDraftSource()` returns the stub when no provider key is present, and never
  silently falls back to it when one is.
- **Secrets:** `.secrets/gsc.json` locally (gitignored), Vercel env vars in deployment.
  The current GSC key was exposed in a chat transcript and should be rotated before
  production.

**Approval does not depend on the filesystem.** Vercel serverless is read-only outside
`/tmp`, so a post approved in production has no file on disk to collect. The decision is
recorded first, the local file write is best-effort inside a `try`, and the durable delivery
path is `/api/posts/[id]/markdown`, which renders the markdown from the row. Filenames go out
as RFC 5987: three live slugs contain curly apostrophes, and an HTTP header is a ByteString,
so the naive form threw a 500 instead of returning a file.

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
- **The brand classifier still has at least one gap.** `heliam ai`, 40 impressions at
  position 4.1, is classified non-brand. It is a misspelling of Helium and is inflating the
  non-brand baseline that every published post will be measured against. Same class as the
  `halium` / `aehlium` / `gallium` / `hai` misses already fixed; this one survived. Fixing it
  means re-running `npm run gsc:reclassify`, which rewrites `is_branded` on stored rows and
  moves the baseline down slightly.

---

## 10. Build order

| Phase | Deliverable | State |
|---|---|---|
| 0 | Schema, config ingest (sheet → keywords, entity-record → ledger), GSC sync, measurement spine | **done** |
| 1 | Five gates as pure functions + unit tests | **done** |
| 2 | Dashboard: generate · draft view · gate report · approve → markdown · history | **done** |
| 3 | Draft pipeline and the `write-blog` skill | **done** |
| 3.1 | Multi-keyword posts, SERP reading, the voice rules | **done** |
| 5 | Keyword intelligence: GSC mining, Linear extraction, the skill, secondary keywords | **done** |
| 4 | Discord webhook notifier | code done and no-ops safely without a URL; **needs `DISCORD_WEBHOOK_URL`** |
| 6 | Stubs: auto-publish handler | open |

Phase 0 ran first and was the piece that would have been unrecoverable if deferred: the
measurement baseline can only be captured going forward. Phase 5 overtook phase 4 because
the target list, not the notifier, was what limited output.

**Still open beyond phase 4:**

- **Rotate the GSC service-account key and the Linear API key.** Both were pasted into a
  chat transcript.
- **A search API key** (`BRAVE_SEARCH_KEY` or `SERPER_API_KEY`). Without one the SERP
  reading works but cannot be automated, so the dashboard Generate button cannot take it.
- **Three unresolved conflicts still block claims:** pricing (₹2,000 vs $100), Shray Arora's
  title, Deepak Kapoor's status (§8).

---

## 11. Out of scope

Auto-publishing · Medium/Reddit syndication · the blog-surface consolidation decision ·
AEO citation tracking (no data source without SEMrush) · the audit/edit engine ·
an About page · comparison pages.
