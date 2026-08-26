import '../lib/env.js';
import { sql, hasDatabase } from '../lib/db/index.js';
import { runGates } from '../lib/gates/index.js';
import { saveGateResults, cannibalizationContext } from '../lib/data/posts.js';
import type { Draft } from '../lib/gates/types.js';

/**
 * Creates one draft that fails on purpose.
 *
 * A review screen that has never rendered a failure has never been tested, and
 * the failing state is the one a reviewer actually has to read carefully.
 * Every failure below is a rule that fires on real Helium content:
 * an encoded apostrophe in a slug, an invented metric, blocked pricing,
 * a hedge, and a superlative.
 */
const BAD: Draft = {
  slug: 'why-product-recommendations-don’t-convert',
  title: 'Why product recommendations don’t convert on Shopify',
  h1: 'Why product recommendations don’t convert on Shopify',
  metaDescription: 'Short meta.',
  primaryKeyword: 'shopify product recommendations',
  clusterId: 'conversion-rate',
  personaId: 'ecommerce-leadership',
  bodyMd: [
    'Most recommendation widgets sit at the bottom of the page and may improve conversion in some cases.',
    '',
    '## What the data shows',
    '',
    'Merchants running our engine see 73% higher conversion, and results are guaranteed.',
    'Plans start at $100/month.',
    'Lenskart lifted revenue per visit 27% in 4 weeks.',
    '',
    'Book a call. Or Contact us to see it in action.',
  ].join('\n'),
};

async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const db = sql();

  const rows = await db`
    insert into posts (slug, title, h1, meta_description, primary_keyword,
                       cluster_id, persona_id, status, body_md, model)
    values (${BAD.slug}, ${BAD.title}, ${BAD.h1}, ${BAD.metaDescription},
            ${BAD.primaryKeyword}, ${BAD.clusterId}, ${BAD.personaId},
            'failed_gates', ${BAD.bodyMd}, 'demo')
    on conflict (slug) do update set body_md = excluded.body_md
    returning id
  `;
  const id = Number(rows[0]!.id);

  const existing = await cannibalizationContext();
  const report = runGates(BAD, {
    existingSlugs: existing.slugs.filter((s) => s !== BAD.slug),
    targetedKeywords: existing.keywords.filter(
      (k) => k.toLowerCase() !== BAD.primaryKeyword.toLowerCase(),
    ),
  });
  await saveGateResults(id, report, 1);

  console.log(`post #${id} — ${report.failureCount} failure(s) across ${report.results.filter((r) => !r.passed).length} gate(s)`);
  for (const r of report.results) {
    if (r.passed) continue;
    console.log(`  ${r.gate}`);
    for (const f of r.failures) console.log(`    · ${f.rule} — ${f.message.slice(0, 90)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
