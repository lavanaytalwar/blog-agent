---
name: write-blog
description: Write a Helium blog post for one or more chosen keywords. Use when asked to draft, write or generate a blog post, or when given a keyword to write about. Takes the keywords and an optional one-line angle, then assembles the brief, generates, gates, and reports what failed.
---

# Write a blog post

## The prompt is two lines, maximum

```
<keyword>[, <keyword>, ...]
<optional: one line of angle or constraint>
```

That is the whole interface. Everything else — cluster, persona, secondary
keywords, the numbers the post may state, the customers it may name, the voice
rules, what the currently-ranking pages cover — is assembled deterministically
by `assembleBrief`. Do not ask the user for any of it, and do not write a longer
brief by hand. If a keyword is ambiguous, run `npm run brief -- "<partial>"`
and show them what matched rather than asking a question.

Examples of a complete prompt:

```
post purchase upsell
```

```
ugc ads
Lead on the cost comparison against agency retainers.
```

```
how to improve revenue per visitor, how to personalise a shopify store
```

The first keyword leads: it owns the slug, title, H1 and meta description. The
rest are covered alongside it in the same post.

## Run it

```
npm run draft -- "<keyword>" ["<also cover this>" ...]
```

One generation, all five gates, written to `content/drafts/`. Quote every
keyword separately — each argument is one target. A single-target post takes
40-60 seconds on glm-5.2 at max reasoning; each extra target adds roughly a
minute, because it adds 250 words to the floor and a section to write.

For several keywords at once, and to see which rules fail across a set:

```
npm run draft:batch -- "<keyword>" "<keyword>" "<keyword>"
```

## What a post may target

**The keywords it was selected for, and their secondaries. Nothing else.**

Every other target on the keyword list belongs to another post. Using one
repeatedly means two posts chasing one query, and the `keyword.foreign` rule
fails the draft for it. A single passing mention is fine; a section built around
someone else's target is not.

The secondaries come from `config/keywords.json` and are already attached to
each selected keyword. Use them roughly twice each. They are supporting terms,
not a checklist to exhaust.

### When more than one keyword is selected

Selecting a second keyword is a real commitment, not a hint. Each one is held to
the same standard as the lead:

| | Lead keyword | Every additional keyword |
|---|---|---|
| Slug, title, H1, meta | required | not required |
| First 100 words | required | not required |
| Its own H2 | — | **required** (`keyword.additional_unheaded`) |
| Minimum uses | 3 | **3** (`keyword.additional_underused`) |
| Its secondaries enforced | yes | **yes** |
| Word floor | 500 | **+250 each** |

Two rules follow from this and neither is negotiable:

- **One post, one cluster.** The persona, the commercial URL and the audience
  guard all hang off the cluster, so a selection spanning two of them has no
  single correct answer. `assembleBrief` throws and `cluster.targets_agree`
  fails. Split it into two posts instead of picking a cluster.
- **One argument, not several posts stapled together.** The selected keywords
  share a cluster and a reader, so there is a single line of reasoning that
  covers all of them. Find it. A post that changes subject at each H2 will pass
  the gates and still be worthless.

If the user selects four or five keywords, say plainly that the floor is now
1,250-1,500 words and ask whether they want that one post or several. Do not
silently drop targets to make the draft easier.

## Reading the gate report

Every rule is in `lib/gates/rules.ts`, and the prompt is rendered from that same
table, so the writer was told about every check that ran. A failure means the
instruction was ignored, not that it was never given.

**Failures worth acting on immediately:**

| Rule | What it usually means |
|---|---|
| `claim.untraceable` | The model invented a number. Almost always a plausible near-miss — `14 days` for the real 15, or an invented price. Never add it to the ledger to make the draft pass. |
| `claim.blocked` | It reached for pricing or a founder name. Both are unsettled internally. |
| `customer.confidential` | A merchant that is not public reached the draft. Treat as serious. |
| `keyword.foreign` | The post drifted into a target it was not selected for. |
| `keyword.additional_unheaded` | A selected keyword got a mention instead of a section. Add an H2 that contains it. |
| `cluster.targets_agree` | Two selected keywords live in different clusters. Split the post. |
| `tone.hard_superlative` | `guaranteed`, `#1`, `the only`, `proven to`. |

**Failures that are usually the draft being lazy:** `length.floor`,
`tone.coined_term_undefined`, `cta.single`, `link.bare_url`. Regenerate with a
note naming the specific rule.

## Regenerating

Two attempts, then stop. Pass the failing rule ids in the note — the writer
responds far better to `tone.coined_term_undefined: define session velocity in
the sentence you first use it` than to "make it better".

If the same rule fails twice, the problem is the prompt or the gate, not the
model. Fix the rule table in `lib/gates/rules.ts` rather than fighting it.

## Never do these

- **Add a number to `config/claim-ledger.json` to make a draft pass.** The ledger
  records what Helium can defend, not what a post would like to say.
- **Loosen a gate to get a green run.** Six batches of five drafts found four
  genuine gate bugs and they were all fixed by making the rule more precise,
  never by making it weaker.
- **Write the post yourself when the model fails twice.** A hand-written post
  that bypasses the pipeline is a post nobody can reproduce.
- **Publish.** Approval is a human action on the dashboard. This skill produces
  a file and stops.

## What good looks like

At the current settings a single-target batch of five lands 4/5 passing,
700-900 words, 40-60 seconds each. A verified two-target post ran 1,266 words in
110 seconds with all five gates green. Every number traceable, both customer attributions correct,
and the mined secondaries appearing naturally in the prose rather than bolted on.
