// NOTE: no `server-only` guard here. These helpers are shared between server
// components and the CLI scripts in scripts/, and that package throws outside
// Next's bundler. No client component imports this module.
import { loadConfig } from '../config/load.js';
import { sql } from '../db/index.js';
import type { Cluster, Keyword } from '../config/types.js';

export type KeywordRow = Keyword & {
  postId: number | null;
  postStatus: string | null;
  serpCount: number;
};

export type ClusterGroup = {
  cluster: Cluster | null;
  keywords: KeywordRow[];
};

export type Coverage = {
  usable: number;
  covered: number;
  remaining: number;
  excluded: number;
  withSecondaries: number;
  secondariesTotal: number;
};

/**
 * Keyword coverage, joined against posts.
 *
 * config/keywords.json is the source of truth for the target list; the database
 * only knows which of them have a post. Reading the list from config rather
 * than the mirrored table means a config change shows up without a re-seed.
 */
export async function keywordCoverage(): Promise<{ groups: ClusterGroup[]; coverage: Coverage }> {
  const { keywords, clusters } = loadConfig();
  const db = sql();

  const posts = await db`
    select id, primary_keyword, status from posts
    where status not in ('discarded', 'failed_gates')
  `;
  const byKeyword = new Map<string, { id: number; status: string }>();
  for (const p of posts) {
    const k = String(p.primary_keyword ?? '').toLowerCase();
    if (k && !byKeyword.has(k)) byKeyword.set(k, { id: Number(p.id), status: String(p.status) });
  }

  const rows: KeywordRow[] = keywords.keywords.map((k) => {
    const hit = byKeyword.get(k.keyword.toLowerCase());
    return {
      ...k,
      postId: hit?.id ?? null,
      postStatus: hit?.status ?? null,
      serpCount: k.serp_competitors?.length ?? 0,
    };
  });

  const usableRows = rows.filter((r) => r.status !== 'excluded');
  const coverage: Coverage = {
    usable: usableRows.length,
    covered: usableRows.filter((r) => r.postId !== null).length,
    remaining: usableRows.filter((r) => r.postId === null).length,
    excluded: rows.length - usableRows.length,
    withSecondaries: usableRows.filter((r) => (r.secondary_keywords?.length ?? 0) > 0).length,
    secondariesTotal: usableRows.reduce((n, r) => n + (r.secondary_keywords?.length ?? 0), 0),
  };

  const order = clusters.clusters.map((c) => c.id);
  const groups: ClusterGroup[] = [];
  for (const id of order) {
    const cluster = clusters.clusters.find((c) => c.id === id) ?? null;
    const inGroup = rows.filter((r) => r.cluster_id === id);
    if (inGroup.length) groups.push({ cluster, keywords: inGroup });
  }
  const orphans = rows.filter((r) => !r.cluster_id || !order.includes(r.cluster_id));
  if (orphans.length) groups.push({ cluster: null, keywords: orphans });

  return { groups, coverage };
}
