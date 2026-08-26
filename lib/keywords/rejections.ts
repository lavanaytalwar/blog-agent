import { sql, hasDatabase } from '../db/index.js';
import { fingerprint } from './fingerprint.js';

export type RejectionScope = 'primary' | 'secondary';

export type Rejection = {
  keyword: string;
  fingerprint: string;
  scope: RejectionScope;
  primaryKeyword: string | null;
  reason: string | null;
  rejectedAt: string;
};

function toRejection(r: Record<string, unknown>): Rejection {
  return {
    keyword: String(r.keyword),
    fingerprint: String(r.fingerprint),
    scope: String(r.scope) as RejectionScope,
    primaryKeyword: r.primary_keyword == null ? null : String(r.primary_keyword),
    reason: r.reason == null ? null : String(r.reason),
    rejectedAt: String(r.rejected_at),
  };
}

export async function listRejections(): Promise<Rejection[]> {
  if (!hasDatabase()) return [];
  const rows = await sql()`
    select fingerprint, keyword, scope, primary_keyword, reason, rejected_at::text
    from keyword_rejections
    order by rejected_at desc
  `;
  return rows.map(toRejection);
}

/**
 * The set mining must subtract. Fingerprints, not strings, so a rejection
 * covers every surface form of the same target.
 */
export async function rejectedFingerprints(): Promise<Set<string>> {
  if (!hasDatabase()) return new Set();
  const rows = await sql()`select fingerprint from keyword_rejections`;
  return new Set(rows.map((r) => String(r.fingerprint)));
}

/**
 * Idempotent. Re-rejecting an already-rejected keyword refreshes its reason and
 * scope but keeps the original `rejected_at`, so the ledger records when the
 * decision was first made.
 */
export async function reject(
  keyword: string,
  scope: RejectionScope = 'primary',
  primaryKeyword: string | null = null,
  reason: string | null = null,
): Promise<Rejection> {
  const fp = fingerprint(keyword);
  if (!fp) throw new Error(`"${keyword}" has no indexable tokens.`);

  const rows = await sql()`
    insert into keyword_rejections (fingerprint, keyword, scope, primary_keyword, reason)
    values (${fp}, ${keyword}, ${scope}, ${primaryKeyword}, ${reason})
    on conflict (fingerprint) do update
      set keyword = excluded.keyword,
          scope = excluded.scope,
          primary_keyword = excluded.primary_keyword,
          reason = coalesce(excluded.reason, keyword_rejections.reason)
    returning fingerprint, keyword, scope, primary_keyword, reason, rejected_at::text
  `;
  return toRejection(rows[0]!);
}

/** Undo. Returns false when the keyword was not on the list. */
export async function unreject(keyword: string): Promise<boolean> {
  const fp = fingerprint(keyword);
  const rows = await sql()`
    delete from keyword_rejections where fingerprint = ${fp} returning fingerprint
  `;
  return rows.length > 0;
}
