# Dashboard specification — Phase 2

**Status:** specification, pre-build
**Date:** 2026-08-26
**Depends on:** Phase 0 (schema, config, GSC) and Phase 1 (the five gates) — both built.

The dashboard is the entire human interface. Discord is a one-way notifier and nothing
more. See [ARCHITECTURE.md](ARCHITECTURE.md) §4.4 for why a chat bot was rejected: a
1,200-word post does not fit in a Discord message.

---

## 1. What it is for

One job: **let a person decide whether a generated draft should exist.**

Everything else on the page exists to make that decision fast — the gate report, the
keyword it targets, what already covers that ground, and whether earlier decisions
turned out well.

It is an internal tool for a handful of people, so it optimises for information density
and zero ambiguity, not for onboarding a stranger.

---

## 2. Sequencing note

Phase 3 builds the draft pipeline. Phase 2 comes first, which means the dashboard has to
be buildable before there is anything real to generate.

**Resolution:** `POST /api/generate` calls a `DraftSource` interface. Phase 2 ships a
`StubDraftSource` that returns the fixture in `lib/gates/fixtures.ts` with the requested
keyword substituted. Phase 3 swaps in the real pipeline behind the same interface. The
dashboard never learns which one it is talking to.

This also means the gate report view can be developed against deliberately broken
fixtures, which is the only way to get that screen right.

---

## 3. Routes

| Route | Renders |
|---|---|
| `/` | Queue — anything awaiting a decision, then recent activity |
| `/generate` | Start a draft: lead keyword, plus any same-cluster keywords to cover with it |
| `/posts` | Every post, filterable by status |
| `/posts/[id]` | **The main screen.** Draft, gate report, decision |
| `/keywords` | Coverage map — which targets have a post, which are untouched |
| `/measurement` | Per-post readings against the blog-wide control |

| API route | Method | Does |
|---|---|---|
| `/api/generate` | POST | Creates a `posts` row, returns its id, runs generation after the response |
| `/api/posts/[id]/decision` | POST | `approve` \| `discard` \| `regenerate` |
| `/api/posts/[id]/status` | GET | Poll target while a draft is generating |
| `/api/cron/gsc-sync` | GET | Nightly Search Console pull |
| `/api/cron/measure` | GET | Nightly +7 / +14 / +28 / +56 readings |
| `/api/cron/drain` | GET | Daily; re-runs drafts orphaned mid-generation. Safe to hit by hand |

---

## 4. The main screen — `/posts/[id]`

Two columns on desktop, stacked on narrow screens. This is the only screen that
justifies real design effort.

```
┌────────────────────────────────┬──────────────────────────────┐
│  DRAFT                         │  GATE REPORT                 │
│                                │                              │
│  title / h1                    │  ✓ strategy                  │
│  slug · cluster · persona      │  ✗ structure          2      │
│  meta description (with        │      slug.ascii              │
│    character count)            │      cta.single              │
│                                │  ✓ provenance                │
│  ─── rendered markdown ───     │  ✓ cannibalization           │
│                                │  ✗ tone_floor         1      │
│  Evidence strings from failed  │      tone.hedging            │
│  rules are highlighted inline  │                              │
│  where they can be located.    │  ── target ──                │
│                                │  keyword, cluster, persona,  │
│                                │  commercial URL, SERP        │
│                                │  competitors from the sheet  │
│                                │                              │
│                                │  ── decision ──              │
│                                │  [ Approve ]  [ Discard ]    │
│                                │  [ Regenerate with a note ]  │
└────────────────────────────────┴──────────────────────────────┘
```

### Gate report rules

- **Every gate is always listed**, passing or not. A screen that only shows failures
  makes it impossible to tell "passed" from "did not run".
- Failure count per gate, in a monospace column.
- Each failure shows its `rule`, its `message`, and its `evidence` verbatim. The rule id
  is the thing to display, not a prettified label — it is what the reviewer will search
  for in `config/`.
- Where `evidence` is a substring of the draft, highlight that substring in the left
  column and let the failure scroll to it.
- **A failing draft is still shown in full.** The reviewer often needs to see the whole
  thing to decide whether the failure matters or the brief was wrong.

### Decision rules

- **Approve is disabled when any gate fails.** No override, no "approve anyway". The
  gates exist precisely so this decision cannot be made on a tired Friday. If a gate is
  wrong, the fix is a config change and a regenerate.
- **Discard** takes an optional note and is terminal.
- **Regenerate** takes a required note, which is passed to the next attempt as feedback,
  and is capped at two attempts per post (`posts.attempt`). At the cap the button
  disappears and the screen says so.
- Every decision writes a `decisions` row with the actor.

### On approve

1. `content/drafts/{slug}.md` is written using `serializeDraft` from `lib/gates/parse.ts`
2. `posts.status` → `approved`, `approved_at` set
3. Discord webhook fires
4. The file is offered as a download from the page

Publishing remains a human action in Framer. There is no publish button, and the
auto-publish handler stays a stub.

---

## 5. `/generate`

Two ways in:

**Also-cover picker** — once a lead keyword is chosen, the untouched keywords in the
same cluster appear as checkboxes, each showing how many secondaries it brings. A live
line reports targets, total secondaries and the resulting word floor, so the cost of
adding a target is visible before the draft is started rather than after it comes back
short. Cross-cluster keywords are never offered: one post covers one cluster.

**Keyword picker** — a table of `keywords` joined against `posts`, showing keyword,
cluster, coverage state, and any `entity_risk`. Excluded keywords are listed but
unselectable, with the exclusion reason visible; hiding them invites someone to
re-add "helium recommendations" in six months.

**Free-text topic** — a text field. The strategy gate will reject anything that does
not resolve to a known keyword, so this is a shortcut, not an escape hatch.

On submit: create the `posts` row with status `drafted`, redirect to `/posts/[id]`,
which polls `/api/posts/[id]/status` every 2 seconds and renders a progress state.

---

## 6. `/keywords`

The coverage map, and the answer to "what should we write next".

Columns: keyword · cluster · persona · status · post (if any) · SERP competitor count ·
entity risk. Grouped by cluster, with a per-cluster count.

Two things this screen must make obvious, because both are true today and neither is
visible anywhere else:

- **`catalog-ops` has one keyword and `aov-basket` has three.** Those clusters run dry
  almost immediately.
- **24 usable targets exist in total.** At one post per prompt, the sheet is exhausted
  inside three months, and GSC striking-distance — the resupply mechanism — currently
  returns nothing.

Show the remaining-target count somewhere permanent. It is the project's real clock.

---

## 7. `/measurement`

Today this screen has no per-post data, because nothing has been published through the
system yet. **The empty state is the most important thing on it.**

Render the blog-wide non-brand line across the full 447 days of history — it sits at
zero, with a single click on it. That is the before-picture, and it is the entire basis
on which this programme will later be judged.

Once posts exist, add per-post rows: publish date, +7, +14, +28 and +56 readings, each beside the
blog-wide control for the same window. A reading without its control is not shown at
all — it would imply an attribution the data cannot support.

Leading indicators, displayed above the table:

- non-brand queries with any impression (69 today, mostly noise)
- sheet keywords holding any ranking (≈0 today)
- non-brand clicks, blog-wide (1, across 447 days)

---

## 8. Generation, without a queue worker

Vercel cron cannot run every few seconds, and a serverless function that returns is
killed along with anything still running inside it. So:

1. `POST /api/generate` inserts the `posts` row and returns immediately
2. The same invocation continues the work using `after()` from `next/server`, which runs
   after the response is flushed but inside the same function lifetime
3. `maxDuration` is set to 300s on that route — comfortably above a draft run
4. `/api/cron/drain` sweeps for `posts` rows still `drafted` with a null `body_md` ten
   minutes on, which covers a cold-start death or a deploy mid-run

The drain runs **daily**, not every minute: the Hobby plan allows no finer cadence. That
cadence is the recovery latency and nothing else — on a healthy day every run recovers
zero — but it does mean an orphaned draft reads as stuck until the sweep. It is a plain
GET, so hitting the route by hand recovers one immediately.

No queue service, no polling worker, no extra infrastructure.

---

## 9. Auth and attribution

**Access** is Vercel deployment protection (Pro). The whole deployment sits behind the
Vercel team login. There is no application-level auth to write, and no password to leak.

**Attribution is a separate problem.** Deployment protection does not pass user identity
to the application, but `decisions.actor` needs a value. On first visit the dashboard
asks "who is deciding?" and stores the answer in a cookie. This is not a security
control — Vercel already did that — it is a label so history is legible. Treat it as
such and never gate anything on it.

---

## 10. Design

Utilitarian. This is a tool that gets scanned and operated, not read.

- **Layout:** a single 1200px column, generous table density, no cards, no shadows.
- **Type:** one grotesque for UI and headings, one monospace for rule ids, slugs, counts,
  and anything a reviewer will compare character by character. Tabular numerals wherever
  digits line up.
- **Colour:** semantic only — pass, fail, blocked, dormant. Semantic colours are not the
  accent. One accent, used for the primary action and nothing else.
- **State is encoded in form as well as colour** — a pill for status, a count for
  failures — so the screen survives a colourblind reader and a bad monitor.
- **CSS Modules with a tokens file, no Tailwind.** Six screens do not justify a build-time
  CSS dependency, and the token file doubles as the place theme decisions live.

Both light and dark, driven by `prefers-color-scheme`.

---

## 11. Out of scope for Phase 2

| Not building | Why |
|---|---|
| In-browser draft editing | The `.md` file is the artefact. Editing prose in a textarea invites bypassing the gates, and the gates are the product. Edit the file and re-run `npm run gate`. |
| A publish button | Framer has no usable write API, and auto-publish is a deliberate stub. |
| Approve-anyway override | The gates are worth having only if they cannot be waved through. |
| Application-level auth | Vercel deployment protection covers it. |
| AEO / citation views | No data source without SEMrush. Deferred, not forgotten. |
| The audit half | Nothing to audit — no non-brand rankings exist yet. |

---

## 12. Definition of done

1. A draft can be generated from `/generate` and lands on `/posts/[id]` without a refresh.
2. The gate report renders all five gates, with evidence highlighted inline.
3. Approve is impossible while any gate fails, and writes both the file and the row.
4. Regenerate is capped at two attempts and passes the note forward.
5. `/keywords` shows the remaining-target count.
6. `/measurement` renders the 447-day non-brand baseline, including its empty state.
7. Every decision has an actor and a timestamp.
8. The deployment is unreachable without a Vercel team login.
