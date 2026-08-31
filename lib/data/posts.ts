// NOTE: no `server-only` guard here. These helpers are shared between server
// components and the CLI scripts in scripts/, and that package throws outside
// Next's bundler. No client component imports this module.
import { sql } from '../db/index.js';
import { serializeDraft } from '../gates/parse.js';
import type { GateReport } from '../gates/types.js';
import type { Review, ReviewNote } from '../review/types.js';

// Publishing happens by hand, outside this system, so `approved` is terminal.
// See migrations/007_retire_published.sql.
export type PostStatus =
  | 'drafted' | 'failed_gates' | 'awaiting_approval'
  | 'approved' | 'discarded';

export type PostRow = {
  id: number;
  slug: string;
  title: string;
  h1: string | null;
  meta_description: string | null;
  primary_keyword: string | null;
  additional_keywords: string[];
  cluster_id: string | null;
  persona_id: string | null;
  status: PostStatus;
  body_md: string | null;
  gate_report: GateReport | null;
  model: string | null;
  attempt: number;
  created_at: string;
  /** When the current attempt started writing. See lib/data/stall.ts. */
  generation_started_at: string | null;
  approved_at: string | null;
  published_url: string | null;
  published_at: string | null;
};

export const MAX_ATTEMPTS = 2;

export async function listPosts(status?: PostStatus): Promise<PostRow[]> {
  const db = sql();
  const rows = status
    ? await db`select * from posts where status = ${status} order by created_at desc`
    : await db`select * from posts order by created_at desc`;
  return rows as PostRow[];
}

export async function awaitingDecision(): Promise<PostRow[]> {
  const db = sql();
  return (await db`
    select * from posts
    where status in ('awaiting_approval', 'failed_gates', 'drafted')
    order by created_at desc
  `) as PostRow[];
}

export async function getPost(id: number): Promise<PostRow | null> {
  const db = sql();
  const rows = await db`select * from posts where id = ${id}`;
  return (rows[0] as PostRow | undefined) ?? null;
}

export async function createPost(input: {
  primaryKeyword: string;
  additionalKeywords?: string[];
  clusterId: string | null;
  personaId: string | null;
  slug: string;
  title: string;
}): Promise<number> {
  const db = sql();
  const rows = await db`
    insert into posts (slug, title, primary_keyword, additional_keywords,
                       cluster_id, persona_id, status)
    values (${input.slug}, ${input.title}, ${input.primaryKeyword},
            ${input.additionalKeywords ?? []},
            ${input.clusterId}, ${input.personaId}, 'drafted')
    returning id
  `;
  return Number(rows[0]!.id);
}

/** Everything gate 4 needs to judge uniqueness, from the database side. */
export async function cannibalizationContext() {
  const db = sql();
  const rows = await db`
    select slug, primary_keyword, additional_keywords from posts
    where status not in ('discarded', 'failed_gates')
  `;
  return {
    slugs: rows.map((r) => String(r.slug)),
    // Every target an existing post claims, not just its lead — otherwise a new
    // post could lead on a keyword an older post already absorbed.
    keywords: rows
      .flatMap((r) => [String(r.primary_keyword ?? ''), ...((r.additional_keywords as string[]) ?? [])])
      .filter(Boolean),
  };
}

export async function recordDecision(
  postId: number,
  actor: string,
  action: 'approve' | 'discard' | 'regenerate',
  note?: string,
): Promise<void> {
  const db = sql();
  await db`
    insert into decisions (post_id, actor, action, note)
    values (${postId}, ${actor}, ${action}, ${note ?? null})
  `;
}

export async function saveGateResults(
  postId: number,
  report: GateReport,
  runIndex: number,
): Promise<void> {
  const db = sql();
  await db`delete from gate_results where post_id = ${postId} and run_index = ${runIndex}`;
  for (const r of report.results) {
    await db`
      insert into gate_results (post_id, gate, passed, failures, run_index)
      values (${postId}, ${r.gate}, ${r.passed}, ${JSON.stringify(r.failures)}, ${runIndex})
    `;
  }
  await db`update posts set gate_report = ${JSON.stringify(report)} where id = ${postId}`;
}


/**
 * The markdown a post exports as, from the database row.
 *
 * One function, used by the approve handler and by the download route, so the
 * file written on disk and the file a reviewer downloads cannot disagree. The
 * previous version of this lived inline in the approve handler and hardcoded
 * `additionalKeywords: []`, which silently dropped every target but the lead
 * from a multi-keyword post's front matter.
 */
export function draftMarkdown(post: PostRow): string {
  return serializeDraft({
    slug: post.slug,
    title: post.title,
    h1: post.h1 ?? post.title,
    metaDescription: post.meta_description ?? '',
    primaryKeyword: post.primary_keyword ?? '',
    additionalKeywords: post.additional_keywords ?? [],
    clusterId: post.cluster_id,
    personaId: post.persona_id,
    bodyMd: post.body_md ?? '',
  });
}

/**
 * Stores one advisory review, keyed to the attempt it read.
 *
 * Upserted on (post_id, run_index) so a re-run of the same attempt replaces its
 * review rather than accumulating readings of a draft that no longer exists.
 */
export async function saveReview(
  postId: number,
  review: Review,
  runIndex: number,
): Promise<void> {
  const db = sql();
  const notes = review.status === 'reviewed' ? review.notes : [];
  const reason = review.status === 'unavailable' ? review.reason : null;
  await db`
    insert into review_results (post_id, run_index, status, model, notes, reason)
    values (${postId}, ${runIndex}, ${review.status}, ${review.model},
            ${JSON.stringify(notes)}, ${reason})
    on conflict (post_id, run_index) do update set
      status = excluded.status, model = excluded.model,
      notes = excluded.notes, reason = excluded.reason,
      created_at = now()
  `;
}

export async function getReview(postId: number, runIndex: number): Promise<Review | null> {
  const db = sql();
  const rows = await db`
    select status, model, notes, reason from review_results
    where post_id = ${postId} and run_index = ${runIndex}
  `;
  return rowToReview(rows[0]);
}

/** The review of whatever the current draft is, for the review screen. */
export async function latestReview(postId: number): Promise<Review | null> {
  const db = sql();
  const rows = await db`
    select status, model, notes, reason from review_results
    where post_id = ${postId} order by run_index desc limit 1
  `;
  return rowToReview(rows[0]);
}

function rowToReview(row: Record<string, unknown> | undefined): Review | null {
  if (!row) return null;
  if (row.status === 'unavailable') {
    return {
      status: 'unavailable',
      model: row.model ? String(row.model) : null,
      reason: String(row.reason ?? 'No reason recorded.'),
    };
  }
  return {
    status: 'reviewed',
    model: String(row.model ?? 'unknown'),
    notes: (row.notes as ReviewNote[] | null) ?? [],
  };
}
