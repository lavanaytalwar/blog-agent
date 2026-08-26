import '../lib/env.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { listProjects } from '../lib/linear/client.js';
import { loadConfig } from '../lib/config/load.js';

/**
 * Builds config/merchants.json from Linear projects.
 *
 * The roster is both the vertical lookup and the leak-prevention list. Ten of
 * Helium's Linear projects are internal; the rest are merchants, and only the
 * ones already named in Helium's own marketing may appear in a draft.
 *
 * Verticals are inferred here and marked as such. Re-running never overwrites a
 * vertical a human has confirmed.
 */
const INTERNAL = new Set([
  'Ad Stack', 'Admin', 'Agency', 'Agents', 'Core Platform', 'Data & Analytics',
  'Growth', 'Infra & Others', 'Overall', 'Team Leaves',
]);

const VERTICAL_HINTS: [RegExp, string][] = [
  [/lenskart|blnk ?eyewear/i, 'eyewear'],
  [/bblunt|b blunt/i, 'haircare'],
  [/aqualogica|deconstruct|dermaco|dr\.? ?sheth|dr ?facts|swiss beauty|sereko|lumineve|innovist|mamaearth|ghar soaps|rini roy|watsons|subtract|fikkins/i, 'beauty and skincare'],
  [/nirmalaya|soullively|promunch|neosapien|leaf\b|staze|gully labs/i, 'wellness and supplements'],
  [/teejh|joker & witch|maje|sandro|ted baker|wrogn|w for woman|aurelia|salty|campus sutra|dressfolks|kisah|sudathi|pairietales|my designation|daily ?woman|boss ?bella|fangoral|fraghill|bumberry|qazmi|pebble|akiso|bruno milano|dailywoman/i, 'apparel and fashion'],
  [/lifelong|iffco garden|pantproject/i, 'home and consumer durables'],
  [/noise/i, 'electronics and wearables'],
  [/m&s|marks/i, 'multi-category retail'],
  [/shopflo/i, 'commerce infrastructure'],
];

function inferVertical(name: string): string {
  for (const [pattern, vertical] of VERTICAL_HINTS) if (pattern.test(name)) return vertical;
  return 'unknown';
}

async function main() {
  const projects = await listProjects();
  const { blocklist } = loadConfig();
  const publicNames = new Set(
    blocklist.approved_public_customers.names.map((n) => normalise(n)),
  );

  // Preserve any vertical a human has confirmed.
  const previous = new Map<string, { vertical: string; vertical_source: string }>();
  const out = 'config/merchants.json';
  if (existsSync(out)) {
    const old = JSON.parse(readFileSync(out, 'utf8')) as { merchants?: { name: string; vertical: string; vertical_source: string }[] };
    for (const m of old.merchants ?? []) previous.set(m.name, m);
  }

  const internal: string[] = [];
  const merchants = [];

  for (const p of projects) {
    if (INTERNAL.has(p.name)) { internal.push(p.name); continue; }
    const kept = previous.get(p.name);
    merchants.push({
      name: p.name,
      vertical: kept?.vertical_source === 'confirmed' ? kept.vertical : inferVertical(p.name),
      vertical_source: kept?.vertical_source === 'confirmed' ? 'confirmed' : 'inferred',
      public: publicNames.has(normalise(p.name)),
      linear_state: p.state,
    });
  }

  merchants.sort((a, b) => a.name.localeCompare(b.name));

  writeFileSync(out, JSON.stringify({
    _source: 'Linear projects. Regenerate with npm run linear:merchants.',
    _rule: 'Gate 3 refuses any merchant name where public is false. Set vertical_source to "confirmed" to stop a re-run overwriting a vertical you fixed by hand.',
    _generated_at: new Date().toISOString().slice(0, 10),
    internal_projects: internal.sort(),
    merchants,
  }, null, 2) + '\n');

  const pub = merchants.filter((m) => m.public).length;
  const unknown = merchants.filter((m) => m.vertical === 'unknown').length;
  console.log(`${projects.length} projects → ${internal.length} internal, ${merchants.length} merchants`);
  console.log(`  publicly namable: ${pub}`);
  console.log(`  confidential:     ${merchants.length - pub}`);
  if (unknown) {
    console.log(`  vertical unknown: ${unknown} — ${merchants.filter((m) => m.vertical === 'unknown').map((m) => m.name).join(', ')}`);
  }
}

/**
 * Linear project names and the approved-customer list spell the same merchant
 * differently. Aliases are explicit rather than fuzzy: a substring match would
 * eventually mark a confidential merchant public, which is the one direction
 * that must never happen.
 */
const ALIASES: Record<string, string> = {
  'saltyfashion': 'salty',
  'ms': 'marksspencer',
  'w': 'wforwoman',
  'gharsoaps': 'gharsoaps',
};

const normalise = (input: string) => {
  const s = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[s] ?? s;
};

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
