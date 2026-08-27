// NOTE: no `server-only` guard here. These helpers are shared between server
// components and the CLI scripts in scripts/, and that package throws outside
// Next's bundler. No client component imports this module.
import { sql } from '../db/index.js';
import { runGates } from '../gates/index.js';
import { cannibalizationContext, saveGateResults, saveReview, getReview } from '../data/posts.js';
import { reviewDraft } from '../review/run.js';
import { weaknesses } from '../review/types.js';
import { getDraftSource } from './source.js';

/**
 * Produces a draft for an existing post row and gates it.
 *
 * Called from a route handler via `after()`, so it owns its own error handling:
 * an unhandled throw here would vanish silently after the response has already
 * been sent.
 */
export async function generateForPost(postId: number, note?: string): Promise<void> {
  const db = sql();
  try {
    const rows = await db`select * from posts where id = ${postId}`;
    const post = rows[0];
    if (!post) return;

    const attempt = Number(post.attempt ?? 1);
    const draft = await getDraftSource().generate({
      primaryKeyword: String(post.primary_keyword ?? ''),
      additionalKeywords: Array.isArray(post.additional_keywords)
        ? (post.additional_keywords as string[])
        : [],
      clusterId: post.cluster_id ? String(post.cluster_id) : null,
      personaId: post.persona_id ? String(post.persona_id) : null,
      note: await composeNote(postId, attempt, note),
      attempt,
    });

    const existing = await cannibalizationContext();
    const report = runGates(draft, {
      // The post's own row must not make it collide with itself.
      existingSlugs: existing.slugs.filter((s) => s !== String(post.slug)),
      // The post's own targets must not make it collide with itself either.
      targetedKeywords: (() => {
        const mine = new Set(
          [String(post.primary_keyword ?? ''), ...((post.additional_keywords as string[]) ?? [])]
            .map((k) => k.toLowerCase()),
        );
        return existing.keywords.filter((k) => !mine.has(k.toLowerCase()));
      })(),
    });

    await db`
      update posts set
        slug = ${draft.slug}, title = ${draft.title}, h1 = ${draft.h1},
        meta_description = ${draft.metaDescription}, body_md = ${draft.bodyMd},
        model = ${getDraftSource().name},
        status = ${report.passed ? 'awaiting_approval' : 'failed_gates'}
      where id = ${postId}
    `;
    await saveGateResults(postId, report, attempt);

    // After the gates, always, and never able to change what they decided. The
    // status above is already written. This reads the nine things a gate cannot
    // check and stores notes beside the report: feedback for the human on a
    // passing draft, and feedback for the next attempt on a failing one.
    await saveReview(postId, await reviewDraft(draft), attempt);
  } catch (error) {
    await db`
      update posts set status = 'failed_gates',
        gate_report = ${JSON.stringify({
          passed: false, failureCount: 1,
          results: [{
            gate: 'strategy', passed: false,
            failures: [{
              rule: 'generation.failed',
              message: error instanceof Error ? error.message : String(error),
            }],
          }],
        })}
      where id = ${postId}
    `;
  }
}

/**
 * The note the writer actually sees on a redraft.
 *
 * A regenerate carries a human note, which is the instruction. The previous
 * attempt's review findings are appended to it because that attempt is already
 * being spent: withholding prose feedback until some later attempt that the
 * two-attempt budget does not allow would just throw it away. Gate failures are
 * not repeated here, they are already in the note the reviewer wrote them into.
 */
async function composeNote(
  postId: number,
  attempt: number,
  note?: string,
): Promise<string | undefined> {
  if (!note || attempt < 2) return note;

  const prior = weaknesses(await getReview(postId, attempt - 1));
  if (!prior.length) return note;

  const lines = prior.map((n) => `- ${n.check}: ${n.note}`).join('\n');
  return `${note}

A reviewer read the previous draft and found these, none of them mechanical:
${lines}

Fix the note above first. These are the reasons the post did not read like a
person wrote it.`;
}
