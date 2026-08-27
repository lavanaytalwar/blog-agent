import { promptChecks, CHECK_IDS } from './checks.js';
import type { Brief } from '../brief/types.js';
import type { Draft } from '../gates/types.js';

const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n');

/**
 * The reviewer's system prompt.
 *
 * Note what it is not given: the gate rules. It cannot re-litigate mechanics it
 * has never seen, which is the whole reason the mechanics stay in code. It gets
 * the brief's judgment-bearing parts and the nine checks, and nothing else.
 */
export function renderReviewPrompt(brief: Brief): string {
  const sections: string[] = [];

  sections.push(`You are reviewing a draft blog post for Helium, an AI personalization
platform for D2C and Shopify ecommerce brands.

You are not a gate. Everything mechanical about this draft has already been
checked by code: keyword counts, length, banned phrases, punctuation, claim
provenance. Do not comment on any of it. Your job is the part code cannot read.

Be a hostile reader, not a supportive one. A draft that is merely competent is
weak. If you cannot point at the sentence that proves a problem, you do not have
a finding.`);

  sections.push(`## What this post was asked to be

Cluster: ${brief.cluster.name} (${brief.cluster.key_problem})
Persona: ${brief.persona.name}. ${brief.persona.titles.join(', ')}.
They own: ${brief.persona.owns.join(', ')}.
Lead keyword: "${brief.primaryKeyword}"${brief.additionalTargets.length
    ? `
Also asked to own: ${brief.additionalTargets.map((t) => `"${t.keyword}"`).join(', ')}`
    : ''}

Customers it was allowed to name:
${brief.namableCustomers.length ? list(brief.namableCustomers) : '  (none)'}

Coined terms it was told to use and define:
${brief.voice.coinedTerms.length ? list(brief.voice.coinedTerms) : '  (none)'}`);

  if (brief.serpCoverage.length) {
    sections.push(`## What the pages currently ranking for this keyword cover

Use this for the serp.lesson_applied check only.

${brief.serpCoverage.map((s) => `${s.url}\n${list(s.headings.slice(0, 8))}`).join('\n\n')}`);
  }

  sections.push(`## The nine checks

${promptChecks()}`);

  sections.push(`## How to answer

Return JSON and nothing else. No preamble, no code fence, no commentary.

{"notes": [{"check": "story.thread", "verdict": "ok", "note": "...", "quote": "..."}]}

Rules for the array:

- Exactly one entry per check, all ${CHECK_IDS.length}, in the order listed above.
- "verdict" is one of: ok, weak, missing.
- "note" is one sentence. Say what is true of this draft, not what a good post
  would do in general.
- "quote" is required whenever the verdict is weak or missing: at least ten
  characters copied exactly from the draft body, the sentence that proves your
  finding. It is checked against the draft, so a paraphrase or an invented
  sentence discards the finding entirely.
- On a verdict of ok, quote the sentence that earns it, or omit the field.

You are not scoring the post and there is no total. Nine independent readings.`);

  return sections.join('\n\n');
}

export function renderReviewMessage(draft: Draft): string {
  return `Review this draft.

Title: ${draft.title}
H1: ${draft.h1}

${draft.bodyMd}`;
}
