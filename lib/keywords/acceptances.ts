import { sql, hasDatabase } from '../db/index.js';
import { fingerprint } from './fingerprint.js';

export type AcceptanceScope = 'primary' | 'secondary';

export type Acceptance = {
  keyword: string;
  fingerprint: string;
  scope: AcceptanceScope;
  primaryKeyword: string | null;
  impressions: number | null;
  clicks: number | null;
  position: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  variants: string[];
  acceptedAt: string;
};

function toAcceptance(r: Record<string, unknown>): Acceptance {
  return {
    keyword: String(r.keyword),
    fingerprint: String(r.fingerprint),
    scope: String(r.scope) as AcceptanceScope,
    primaryKeyword: r.primary_keyword == null ? null : String(r.primary_keyword),
    impressions: r.impressions == null ? null : Number(r.impressions),
    clicks: r.clicks == null ? null : Number(r.clicks),
    position: r.position == null ? null : Number(r.position),
    firstSeen: r.first_seen == null ? null : String(r.first_seen),
    lastSeen: r.last_seen == null ? null : String(r.last_seen),
    variants: Array.isArray(r.variants) ? (r.variants as string[]) : [],
    acceptedAt: String(r.accepted_at),
  };
}

export async function listAcceptances(): Promise<Acceptance[]> {
  if (!hasDatabase()) return [];
  const rows = await sql()`
    select fingerprint, keyword, scope, primary_keyword, impressions, clicks,
           position, first_seen, last_seen, variants, accepted_at::text
    from keyword_acceptances
    order by accepted_at desc
  `;
  return rows.map(toAcceptance);
}

/** The set mining must subtract, same reasoning as rejectedFingerprints. */
export async function acceptedFingerprints(): Promise<Set<string>> {
  if (!hasDatabase()) return new Set();
  const rows = await sql()`select fingerprint from keyword_acceptances`;
  return new Set(rows.map((r) => String(r.fingerprint)));
}

/**
 * Idempotent, like reject(). Re-accepting refreshes the evidence but keeps the
 * original accepted_at.
 */
export async function accept(input: {
  keyword: string;
  scope?: AcceptanceScope;
  primaryKeyword?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  position?: number | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  variants?: string[];
}): Promise<Acceptance> {
  const fp = fingerprint(input.keyword);
  if (!fp) throw new Error(`"${input.keyword}" has no indexable tokens.`);

  const scope = input.scope ?? 'secondary';
  if (scope === 'secondary' && !input.primaryKeyword) {
    throw new Error('A secondary candidate needs the primary it belongs to.');
  }

  const rows = await sql()`
    insert into keyword_acceptances (
      fingerprint, keyword, scope, primary_keyword,
      impressions, clicks, position, first_seen, last_seen, variants
    )
    values (
      ${fp}, ${input.keyword}, ${scope}, ${input.primaryKeyword ?? null},
      ${input.impressions ?? null}, ${input.clicks ?? null}, ${input.position ?? null},
      ${input.firstSeen ?? null}, ${input.lastSeen ?? null}, ${input.variants ?? []}
    )
    on conflict (fingerprint) do update
      set keyword = excluded.keyword,
          scope = excluded.scope,
          primary_keyword = excluded.primary_keyword,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          position = excluded.position,
          first_seen = excluded.first_seen,
          last_seen = excluded.last_seen,
          variants = excluded.variants
    returning fingerprint, keyword, scope, primary_keyword, impressions, clicks,
              position, first_seen, last_seen, variants, accepted_at::text
  `;
  return toAcceptance(rows[0]!);
}

/** Undo. Returns false when the keyword was not staged. */
export async function unaccept(keyword: string): Promise<boolean> {
  const fp = fingerprint(keyword);
  const rows = await sql()`
    delete from keyword_acceptances where fingerprint = ${fp} returning fingerprint
  `;
  return rows.length > 0;
}
