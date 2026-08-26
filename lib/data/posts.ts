// NOTE: no `server-only` guard here. These helpers are shared between server
// components and the CLI scripts in scripts/, and that package throws outside
// Next's bundler. No client component imports this module.
import { sql } from '../db/index.js';
import type { GateReport } from '../gates/types.js';

export type PostStatus =
  | 'drafted' | 'failed_gates' | 'awaiting_approval'
  | 'approved' | 'discarded' | 'published' | 'measured';

export type PostRow = {
  id: number;
  slug: string;
  title: string;
  h1: string | null;
  meta_description: string | null;
  primary_keyword: string | null;
  cluster_id: string | null;
  persona_id: string | null;
  status: PostStatus;
  body_md: string | null;
  gate_report: GateReport | null;
  model: string | null;
  attempt: number;
  created_at: string;
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
