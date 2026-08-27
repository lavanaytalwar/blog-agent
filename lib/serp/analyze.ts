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

export type PageKind = 'article' | 'listing' | 'product' | 'other' | 'unreadable';

/**
 * Below this, the fetch did not get the content.
 *
 * A page that returns 21 words of prose is a consent wall, a JS-rendered shell
 * or a paywall, not a short article. It was being classified as an article on
 * the strength of its schema and then counted in the median as though someone
 * ranks with 21 words. Excluding it is the difference between measuring the
 * competition and measuring our own failures to read it.
 */
const MIN_READABLE_WORDS = 250;

export type PageAnalysis = {
  url: string;
  host: string;
  kind: PageKind;
  title: string;
  words: number;
  /**
   * Characters of prose, whitespace included.
   *
   * The enforced unit. Word counts depend on how you split, and a post can pad
   * its word count with short filler while saying less. Characters cannot be
   * gamed that way and are measured identically on their pages and on ours.
   */
  chars: number;
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

/**
 * Elements named by their class or id as page furniture rather than content.
 * Measured against real pages, removing these takes 15 to 20% off a typical
 * marketing blog post: related-post rails, share bars and newsletter blocks are
 * text, and counting them inflates every page's length equally.
 */
const CHROME_NAMES =
  'nav|menu|sidebar|related|recommend|comment|footer|header|cookie|consent'
  + '|banner|subscribe|newsletter|breadcrumb|table-of-contents|share|social|popup|modal';

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(
      new RegExp(`<(div|section|ul)[^>]*(?:class|id)="[^"]*(?:${CHROME_NAMES})[^"]*"[\\s\\S]{0,30000}?</\\1>`, 'gi'),
      ' ',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The narrowest container that holds the actual writing.
 *
 * `<article>` first, then `<main>`, then the whole document. Falling straight
 * from article to whole-document meant any page without an article tag was
 * measured including its entire chrome.
 */
function contentScope(html: string): string {
  for (const tag of ['article', 'main'] as const) {
    const m = html.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'i'));
    if (m?.[0] && m[0].length > 500) return m[0];
  }
  return html;
}

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
  if (words < MIN_READABLE_WORDS) return 'unreadable';
  const { hostname, pathname } = new URL(url);
  const host = hostname.replace(/^www\./, '');

  // A homepage is a product page however much copy it carries. adcreative.ai's
  // front page reads as 4,616 words of feature marketing and was the only
  // "article" found for its keyword, which would have set that post's target
  // from a landing page.
  if (pathname === '/' || pathname === '') return 'product';
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

    // Where the fetch actually landed, not what was asked for. Search providers
    // hand back redirect wrappers rather than destinations: Apify's Google actor
    // returns https://www.google.com/goto?url=<opaque>, whose payload cannot be
    // decoded locally. Reading the input URL here reported every result as
    // google.com and classified real articles as "other", because classify()
    // keys off the path.
    const landed = res.url || url;
    const host = new URL(landed).hostname.replace(/^www\./, '');

    // A redirect that never left the search engine did not resolve. Analysing
    // the interstitial would silently contribute a 3-word "page" to the median.
    if (/(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$|(^|\.)duckduckgo\.com$/.test(host)) {
      return null;
    }

    const body = contentScope(html);
    const text = strip(body);
    const words = text.split(/\s+/).filter(Boolean).length;
    const chars = text.length;

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
      url: landed, host, title, words, chars, h2s, updated, schema, outbound, introWords,
      kind: classify(landed, html, schema, words, title),
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
  /** The number the length gate is built on. */
  medianChars: number;
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
  const medianChars = median(written.map((p) => p.chars));
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
    obs.push(`The ${n} written ${plural} a median of ${medianChars} characters (about ${medianWords} words) across ${medianH2s} H2 sections.`);
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
  const unreadable = skipped.filter((s) => s.kind === 'unreadable').length;
  const nonEditorial = skipped.filter((s) => s.kind !== 'unreadable');
  if (nonEditorial.length) {
    obs.push(`${nonEditorial.length} of the top results are not written pages (${[...new Set(nonEditorial.map((s) => s.kind))].join(', ')}), so the SERP is not purely editorial.`);
  }
  // Said out loud rather than silently narrowing the sample: a lesson drawn
  // from two of six pages is a weaker lesson and the reader should know.
  if (unreadable) {
    obs.push(`${unreadable} page(s) could not be read (consent wall, paywall or JS-rendered) and are excluded from these numbers.`);
  }

  return {
    analysed: written.length, skipped, medianWords, medianChars, medianH2s, roundups,
    withQuestions, withTables, freshWithin12Months: fresh, medianOutbound,
    medianIntroWords, observations: obs,
  };
}
