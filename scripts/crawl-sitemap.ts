/**
 * Reads the live blog surface from the sitemap. Feeds the cannibalization gate
 * (slug uniqueness) and flags slug hygiene problems on posts already published.
 *
 * Deliberately loud on failure: if Framer changes its sitemap shape this must
 * error rather than quietly report zero posts, or gate 4 would start passing
 * everything.
 */
import { pathToFileURL } from 'node:url';

const SITEMAP = 'https://www.gethelium.co/sitemap.xml';
const BLOG_PREFIX = 'https://www.gethelium.co/blogs/';

export type LivePost = { url: string; slug: string; issues: string[] };

export async function fetchLivePosts(): Promise<LivePost[]> {
  const res = await fetch(SITEMAP, { headers: { 'user-agent': 'blogEO/0.1 (+gethelium.co)' } });
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`);

  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim());
  if (locs.length === 0) throw new Error('sitemap parsed to zero URLs — shape has changed');

  const posts = locs
    .filter((u) => u.startsWith(BLOG_PREFIX) && u !== BLOG_PREFIX)
    .map((url) => {
      const raw = url.slice(BLOG_PREFIX.length);
      const slug = decodeURIComponent(raw);
      const issues: string[] = [];
      if (raw !== slug) issues.push('percent-encoded characters in slug');
      if (/[^a-z0-9-]/.test(slug)) issues.push('non-ASCII or punctuation in slug');
      if (slug.includes('.')) issues.push('period in slug');
      return { url, slug, issues };
    });

  if (posts.length === 0) throw new Error('sitemap contained no /blogs/ URLs — shape has changed');
  return posts;
}

async function main() {
  const posts = await fetchLivePosts();
  console.log(`${posts.length} live posts under /blogs/\n`);
  const dirty = posts.filter((p) => p.issues.length);
  for (const p of posts) console.log(`  ${p.issues.length ? '!' : ' '} ${p.slug}`);
  if (dirty.length) {
    console.log(`\n${dirty.length} slug hygiene issue(s):`);
    for (const p of dirty) console.log(`  ${p.url}\n    → ${p.issues.join('; ')}`);
  }
}

// Run directly, but stay importable. pathToFileURL matters here: the repo path
// contains a space, so a naive `file://${argv[1]}` comparison never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
