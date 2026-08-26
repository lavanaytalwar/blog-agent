/**
 * Why a page holds a position, measured rather than guessed.
 *
 * Everything here is read off the HTML. No model looks at these pages: a model
 * asked "why does this rank" produces a plausible essay, and a plausible essay
 * is exactly what this codebase spends its gates rejecting. What a writer can
 * actually act on is the shape of the page, and shape is countable.
 */

const UA = 'Mozilla/5.0 (compatible; blogEO/0.1; +https://www.gethelium.co)';
const TIMEOUT_MS = 15_000;

export type PageKind = 'article' | 'listing' | 'product' | 'other';

export type PageAnalysis = {
  url: string;
  host: string;
  kind: PageKind;
  title: string;
  words: number;
  h2s: string[];
  /** Last modified or published, whichever is later. */
  updated: string | null;
  ageDays: number | null;
  schema: string[];
  lists: number;
  tables: number;
  /** Question-shaped headings. The observable half of an FAQ block. */
  questions: number;
  images: number;
  /** Links out to other domains. Citing sources is a visible quality signal. */
  outbound: number;
  /** Words before the first H2. A short one means the page answers immediately. */
  introWords: number;
  hasAuthor: boolean;
  /** Title begins with a number: "10 Best...". */
  isNumberedList: boolean;
};

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clean = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();

function headingsOf(html: string, level: number): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'gi'))) {
    const t = clean(m[1] ?? '');
    if (t.length >= 3 && t.length <= 120) out.push(t);
  }
  return out;
}

/** JSON-LD @type values, flattened. Article/FAQPage/HowTo are the ones that matter. */
function schemaTypes(html: string): string[] {
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of (m[1] ?? '').matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      if (t[1]) types.add(t[1]);
    }
  }
  return [...types];
}

function dateOf(html: string): string | null {
  const patterns = [
    /"dateModified"\s*:\s*"([^"]+)"/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i,
    /<time[^>]+datetime=["']([^"']+)/i,
  ];
  const found: number[] = [];
  for (const re of patterns) {
    const raw = html.match(re)?.[1];
    const t = raw ? Date.parse(raw) : NaN;
    if (!Number.isNaN(t)) found.push(t);
  }
  if (!found.length) return null;
  return new Date(Math.max(...found)).toISOString().slice(0, 10);
}

/**
 * A blog post, a roundup, a product page, or something else.
 *
 * The user's rule is "if they are blogs, learn from them". An app-store listing
 * ranking for a commercial keyword tells a writer nothing about how to write,
 * so it has to be separable from an article rather than averaged in with one.
 */
function classify(url: string, html: string, schema: string[], words: number, title: string): PageKind {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (/apps\.shopify\.com|\.myshopify\.com|\/products?\//.test(url)) return 'product';
  if (schema.some((t) => /^(Product|SoftwareApplication|Offer)$/i.test(t))) return 'product';
  if (schema.some((t) => /Article|BlogPosting|NewsArticle/i.test(t))) return 'article';
  if (/\/blog\/|\/blogs\/|\/guides?\/|\/resources\/|\/learn\//.test(url)) return 'article';
  // A roundup with no article schema still reads and ranks like one.
  if (/^\d+\s|\bbest\b|\btop\b/i.test(title) && words > 700) return 'listing';
  if (words > 900 && headingsOf(html, 2).length >= 3) return 'article';
  if (host.split('.').length <= 2 && words < 400) return 'other';
  return 'other';
}

export async function analyzePage(url: string): Promise<PageAnalysis | null> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: control.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const host = new URL(url).hostname.replace(/^www\./, '');

    const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const text = strip(body);
    const words = text.split(/\s+/).filter(Boolean).length;

    const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    const h2s = headingsOf(body, 2);
    const schema = schemaTypes(html);
    const updated = dateOf(html);

    const outbound = [...html.matchAll(/<a[^>]+href=["']https?:\/\/([^/"']+)/gi)]
      .filter((m) => m[1] && !m[1].includes(host)).length;

    const firstH2 = body.search(/<h2[\s>]/i);
    const introWords = firstH2 > 0
      ? strip(body.slice(0, firstH2)).split(/\s+/).filter(Boolean).length
      : words;

    return {
      url, host, title, words, h2s, updated, schema, outbound, introWords,
      kind: classify(url, html, schema, words, title),
      ageDays: updated ? Math.round((Date.now() - Date.parse(updated)) / 86_400_000) : null,
      lists: (body.match(/<[uo]l[\s>]/gi) ?? []).length,
      tables: (body.match(/<table[\s>]/gi) ?? []).length,
      questions: h2s.filter((h) => h.trim().endsWith('?')).length
        + headingsOf(body, 3).filter((h) => h.trim().endsWith('?')).length,
      images: (body.match(/<img[\s>]/gi) ?? []).length,
      hasAuthor: /"author"\s*:|rel=["']author["']|class=["'][^"']*author/i.test(html),
      isNumberedList: /^\d+\s/.test(title),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const median = (ns: number[]) => {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2));
};

export type SerpLesson = {
  /** Pages that are actually written, not store listings. */
  analysed: number;
  skipped: { url: string; kind: PageKind }[];
  medianWords: number;
  medianH2s: number;
  /** How many of the written pages are numbered roundups. */
  roundups: number;
  withQuestions: number;
  withTables: number;
  freshWithin12Months: number;
  medianOutbound: number;
  medianIntroWords: number;
  /** One measured observation per line, ready to render into the prompt. */
  observations: string[];
};

/**
 * Turns the measurements into the handful of statements a writer can act on.
 *
 * Every line is derived from a count, so two runs over the same pages produce
 * the same lesson. Nothing here is an opinion about SEO.
 */
export function lessonFrom(pages: PageAnalysis[]): SerpLesson {
  const written = pages.filter((p) => p.kind === 'article' || p.kind === 'listing');
  const skipped = pages.filter((p) => p.kind !== 'article' && p.kind !== 'listing')
    .map((p) => ({ url: p.url, kind: p.kind }));

  const medianWords = median(written.map((p) => p.words));
  const medianH2s = median(written.map((p) => p.h2s.length));
  const roundups = written.filter((p) => p.isNumberedList || p.kind === 'listing').length;
  const withQuestions = written.filter((p) => p.questions >= 2).length;
  const withTables = written.filter((p) => p.tables > 0).length;
  const fresh = written.filter((p) => p.ageDays !== null && p.ageDays <= 365).length;
  const medianOutbound = median(written.map((p) => p.outbound));
  const medianIntroWords = median(written.map((p) => p.introWords));

  const obs: string[] = [];
  if (written.length) {
    const n = written.length;
    const plural = n === 1 ? 'page runs' : 'pages run';
    obs.push(`The ${n} written ${plural} a median of ${medianWords} words across ${medianH2s} H2 sections.`);
    if (roundups >= Math.ceil(written.length / 2)) {
      obs.push(`${roundups} of ${written.length} are numbered roundups ("10 Best..."). The SERP wants a comparison, so beat it on depth per item rather than by writing another list.`);
    } else {
      obs.push(`Only ${roundups} of ${written.length} are numbered roundups, so a single-argument piece competes here.`);
    }
    if (withQuestions) obs.push(`${withQuestions} of ${written.length} carry question-shaped headings. Answer the question in the sentence under the heading.`);
    if (withTables) obs.push(`${withTables} of ${written.length} use a comparison table.`);
    obs.push(fresh
      ? `${fresh} of ${written.length} were updated in the last 12 months. This is a keyword where freshness is being rewarded.`
      : `None carry a date inside the last 12 months, so the bar here is substance rather than recency.`);
    if (medianOutbound >= 5) obs.push(`They cite a median of ${medianOutbound} external sources.`);
    obs.push(`They answer in a median of ${medianIntroWords} words before the first H2.`);
  }
  if (skipped.length) {
    obs.push(`${skipped.length} of the top results are not written pages (${[...new Set(skipped.map((s) => s.kind))].join(', ')}), so the SERP is not purely editorial.`);
  }

  return {
    analysed: written.length, skipped, medianWords, medianH2s, roundups,
    withQuestions, withTables, freshWithin12Months: fresh, medianOutbound,
    medianIntroWords, observations: obs,
  };
}
