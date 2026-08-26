import '../lib/env.js';
import { hasDatabase } from '../lib/db/index.js';
import { strikingDistance, secondaryCandidates, thresholds } from '../lib/gsc/mine.js';

/**
 * Deterministic half of the gsc-keywords skill. Emits candidates with their
 * evidence; the judgment about which are real belongs to the skill.
 */
async function main() {
  if (!hasDatabase()) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const json = process.argv.includes('--json');

  const [striking, secondaries] = await Promise.all([strikingDistance(), secondaryCandidates()]);

  if (json) {
    console.log(JSON.stringify({ thresholds, striking, secondaries }, null, 2));
    return;
  }

  const s = thresholds.STRIKING;
  console.log(`STRIKING DISTANCE — new primaries`);
  console.log(`  filter: >=${s.minImpressions} impressions, position ${s.minPosition}-${s.maxPosition}, not already targeted, not in history\n`);
  if (!striking.length) {
    console.log('  none.\n');
  } else {
    for (const c of striking) {
      console.log(`  ${String(c.impressions).padStart(5)} imp  pos ${String(c.position).padStart(5)}  ${c.query}`);
    }
    console.log();
  }

  console.log(`SECONDARY CANDIDATES — variants of an existing primary`);
  console.log(`  filter: >=${thresholds.SECONDARY.minImpressions} impressions, shares >=60% of a primary's tokens\n`);
  if (!secondaries.length) {
    console.log('  none.\n');
  } else {
    let current = '';
    for (const c of secondaries) {
      if (c.primary !== current) { current = c.primary; console.log(`  ${current}`); }
      const also = c.variants.length ? `  (+${c.variants.length} variant${c.variants.length === 1 ? '' : 's'})` : '';
      console.log(`     ${String(c.impressions).padStart(5)} imp  pos ${String(c.position).padStart(5)}  ${c.query}${also}`);
    }
    console.log();
  }

  console.log(`${striking.length} striking-distance candidate(s), ${secondaries.length} secondary candidate(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
