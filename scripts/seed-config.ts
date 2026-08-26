/**
 * Pushes the version-controlled config files into Postgres.
 * The JSON in config/ stays the source of truth; these tables are a queryable
 * mirror so the dashboard can join keywords against posts and coverage.
 */
import '../lib/env.js';
import { readFile } from 'node:fs/promises';
import { sql, hasDatabase } from '../lib/db/index.js';

type Cluster = {
  id: string; name: string; key_problem: string; personas: string[];
  commercial_url: string; coined_terms: string[]; engine: 'diagnostic' | 'seasonal';
  audience_guard?: unknown; notes?: string;
};
type Persona = { id: string; name: string; titles: string[]; owns: string[] };
type Keyword = {
  keyword: string; cluster_id: string | null; outline: string | null;
  serp_competitors: string[]; push_target: string | null; status: string;
  entity_risk?: string; exclusion_reason?: string;
  secondary_keywords?: unknown[]; secondary_source?: string;
};
type Claim = { key: string; value: string; numerals: string[]; tier: string; source_ref: string };
type Blocked = Claim & { blocked_reason: string };

const load = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;

async function main() {
  if (!hasDatabase()) {
    console.error('DATABASE_URL is not set. See .env.example.');
    process.exit(1);
  }
  const db = sql();

  const clustersDoc = await load<{ clusters: Cluster[]; personas: Persona[] }>('config/clusters.json');
  const keywordsDoc = await load<{ keywords: Keyword[] }>('config/keywords.json');
  const ledgerDoc = await load<{ claims: Claim[]; blocked: Blocked[]; ratified_at: string }>('config/claim-ledger.json');

  for (const p of clustersDoc.personas) {
    await db`insert into personas (id, name, titles, owns)
             values (${p.id}, ${p.name}, ${p.titles}, ${p.owns})
             on conflict (id) do update set
               name = excluded.name, titles = excluded.titles, owns = excluded.owns`;
  }
  console.log(`  personas   ${clustersDoc.personas.length}`);

  for (const c of clustersDoc.clusters) {
    await db`insert into clusters (id, name, key_problem, personas, commercial_url,
                                   coined_terms, engine, audience_guard, notes)
             values (${c.id}, ${c.name}, ${c.key_problem}, ${c.personas}, ${c.commercial_url},
                     ${c.coined_terms}, ${c.engine},
                     ${c.audience_guard ? JSON.stringify(c.audience_guard) : null},
                     ${c.notes ?? null})
             on conflict (id) do update set
               name = excluded.name, key_problem = excluded.key_problem,
               personas = excluded.personas, commercial_url = excluded.commercial_url,
               coined_terms = excluded.coined_terms, engine = excluded.engine,
               audience_guard = excluded.audience_guard, notes = excluded.notes,
               updated_at = now()`;
  }
  console.log(`  clusters   ${clustersDoc.clusters.length}`);

  for (const k of keywordsDoc.keywords) {
    await db`insert into keywords (keyword, cluster_id, outline, serp_competitors,
                                   push_target, status, entity_risk, exclusion_reason,
                                   secondary_keywords, secondary_source)
             values (${k.keyword}, ${k.cluster_id}, ${k.outline}, ${k.serp_competitors ?? []},
                     ${k.push_target}, ${k.status}, ${k.entity_risk ?? null},
                     ${k.exclusion_reason ?? null},
                     ${JSON.stringify(k.secondary_keywords ?? [])}, ${k.secondary_source ?? null})
             on conflict (keyword) do update set
               cluster_id = excluded.cluster_id, outline = excluded.outline,
               serp_competitors = excluded.serp_competitors, push_target = excluded.push_target,
               status = excluded.status, entity_risk = excluded.entity_risk,
               exclusion_reason = excluded.exclusion_reason,
               secondary_keywords = excluded.secondary_keywords,
               secondary_source = excluded.secondary_source, updated_at = now()`;
  }
  console.log(`  keywords   ${keywordsDoc.keywords.length}`);

  const all = [
    ...ledgerDoc.claims.map((c) => ({ ...c, blocked: false, blocked_reason: null as string | null })),
    ...ledgerDoc.blocked.map((c) => ({ ...c, blocked: true, blocked_reason: c.blocked_reason })),
  ];
  for (const c of all) {
    await db`insert into claim_ledger (claim_key, value, numerals, tier, source_ref,
                                       ratified_at, blocked, blocked_reason)
             values (${c.key}, ${c.value}, ${c.numerals}, ${c.tier},
                     ${c.source_ref ?? 'entity-record §5'}, ${ledgerDoc.ratified_at},
                     ${c.blocked}, ${c.blocked_reason})
             on conflict (claim_key) do update set
               value = excluded.value, numerals = excluded.numerals, tier = excluded.tier,
               source_ref = excluded.source_ref, ratified_at = excluded.ratified_at,
               blocked = excluded.blocked, blocked_reason = excluded.blocked_reason`;
  }
  console.log(`  claims     ${all.length} (${ledgerDoc.blocked.length} blocked)`);
  console.log('\nseed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
