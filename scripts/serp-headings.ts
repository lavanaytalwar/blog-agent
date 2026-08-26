import '../lib/env.js';
import { loadConfig } from '../lib/config/load.js';

/**
 * Tier 2 of the evidence ladder: read what the pages that already rank actually
 * cover. Not our data, but real data — those pages hold the position, so their
 * section headings are evidence about the intent cluster.
 *
 * Deterministic: fetch and extract. Deciding which headings are secondaries is
 * the skill's judgment, not this script's.
 */
const UA = 'Mozilla/5.0 (compatible; blogEO/0.1; +https://www.gethelium.co)';
const TIMEOUT_MS = 12_000;

/**
 * Store-listing and directory chrome. These pages rank for commercial keywords
 * but their headings are prices, review counts and navigation, not subject
 * matter. Filtering them is what separates a usable tier-2 read from noise.
 */
const CHROME = [
  /^\$|^₹|\/ month$|^free to install$/i,
  /^reviews? \(/i,
  /^apps by category$|^featured images gallery$|^more apps like this$/i,
  /^resources$|^developer$|^support$|^pricing$|^want to add an app/i,
  /^similar apps|^related|^categories$|^sign in$|^get started$/i,
  /^table of contents$|^share this|^subscribe|^newsletter/i,
];

function isChrome(text: string): boolean {
  return CHROME.some((re) => re.test(text.trim()));
}

function headings(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<h([123])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = (m[2] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length >= 8 && text.length <= 90 && !isChrome(text)) out.push(text);
  }
  return [...new Set(out)];
}

async function fetchPage(url: string): Promise<string[] | null> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: control.signal });
    if (!res.ok) return null;
    return headings(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const { keywords } = loadConfig();

  const targets = keywords.keywords.filter((k) => {
    if (!k.serp_competitors?.length) return false;
    if (wanted.length) return wanted.some((w) => k.keyword.toLowerCase().includes(w.toLowerCase()));
    return k.secondary_source === 'none';
  });

  for (const k of targets) {
    console.log(`\n${'='.repeat(72)}\n${k.keyword}\n${'='.repeat(72)}`);
    // Both columns from the sheet: the raw SERP and the clean-room "best X"
    // results, which skew toward guides rather than store listings.
    const urls = [...new Set([...(k.serp_competitors ?? []), ...(k.clean_room_top5 ?? [])])];
    for (const url of urls.slice(0, 10)) {
      const hs = await fetchPage(url);
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (!hs) { console.log(`  [blocked] ${host}`); continue; }
      console.log(`  ${host}`);
      for (const h of hs.slice(0, 12)) console.log(`     · ${h}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
