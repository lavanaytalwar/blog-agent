/**
 * Top organic results for a keyword.
 *
 * Pluggable rather than hard-wired, and never a scrape of a search engine's own
 * results page: that breaks constantly and is against the terms of every engine
 * worth querying. Two supported providers, both cheap, plus an explicit "no
 * provider" answer so the caller can fall back to URLs supplied by hand instead
 * of silently analysing nothing.
 */

export type SearchHit = { url: string; title: string; rank: number };

export type SearchProvider = 'apify' | 'brave' | 'serper' | 'none';

export function searchProvider(): SearchProvider {
  if (process.env.APIFY_TOKEN) return 'apify';
  if (process.env.BRAVE_SEARCH_KEY) return 'brave';
  if (process.env.SERPER_API_KEY) return 'serper';
  return 'none';
}

/**
 * Apify runs an actor in a container, so it is slower than a plain search API.
 * A cold start is tens of seconds. The generate route allows 300.
 */
const APIFY_TIMEOUT_MS = 120_000;
const APIFY_ACTOR = process.env.APIFY_SEARCH_ACTOR ?? 'apify~google-search-scraper';

export class SearchError extends Error {}

export async function topResults(keyword: string, count = 6): Promise<SearchHit[]> {
  const provider = searchProvider();
  if (provider === 'apify') return apify(keyword, count);
  if (provider === 'brave') return brave(keyword, count);
  if (provider === 'serper') return serper(keyword, count);
  throw new SearchError(
    'No search provider configured. Set APIFY_TOKEN, BRAVE_SEARCH_KEY or SERPER_API_KEY, '
    + 'or pass the result URLs on the command line.',
  );
}

/**
 * Apify's synchronous run endpoint: one POST that blocks until the actor
 * finishes and returns its dataset rows directly, so there is no run id to poll
 * and no queue to manage.
 *
 * The token goes in the Authorization header rather than the `?token=` query
 * parameter Apify also accepts. Both work; a credential in a URL ends up in
 * proxy logs and error messages.
 */
async function apify(q: string, count: number): Promise<SearchHit[]> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), APIFY_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`,
      {
        method: 'POST',
        signal: control.signal,
        headers: {
          authorization: `Bearer ${process.env.APIFY_TOKEN!}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          queries: q,
          // Ask for a full page and slice locally. The actor bills per result
          // page, not per result, so requesting 10 and taking 6 costs the same
          // as requesting 6 and leaves room when the top hits are unfetchable.
          resultsPerPage: 10,
          maxPagesPerQuery: 1,
          countryCode: 'us',
          languageCode: 'en',
        }),
      },
    );
    if (!res.ok) {
      throw new SearchError(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return organicFrom(await res.json(), count);
  } catch (e) {
    if (e instanceof SearchError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new SearchError(`Apify did not finish within ${APIFY_TIMEOUT_MS / 1000}s.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type ApifyItem = { organicResults?: { url?: string; title?: string }[] };

/**
 * One dataset row per result page, organic results nested inside.
 *
 * Exported so the shape can be tested without a live account: this is the only
 * part of the provider that is not a plain fetch, and it is the part that
 * breaks if the actor changes its output.
 */
export function organicFrom(payload: unknown, count: number): SearchHit[] {
  const rows = Array.isArray(payload) ? (payload as ApifyItem[]) : [];
  const hits = rows
    .flatMap((r) => r.organicResults ?? [])
    .filter((r): r is { url: string; title?: string } => typeof r.url === 'string')
    .map((r) => ({ url: r.url, title: r.title ?? '' }));

  if (!hits.length) {
    throw new SearchError(
      'Apify returned no organic results. Check the actor id in APIFY_SEARCH_ACTOR '
      + 'and that the run did not fail on the Apify console.',
    );
  }
  return hits.slice(0, count).map((h, i) => ({ ...h, rank: i + 1 }));
}

async function brave(q: string, count: number): Promise<SearchHit[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', q);
  url.searchParams.set('count', String(Math.min(count * 2, 20)));
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-subscription-token': process.env.BRAVE_SEARCH_KEY!,
    },
  });
  if (!res.ok) throw new SearchError(`Brave ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { web?: { results?: { url: string; title: string }[] } };
  return (json.web?.results ?? []).slice(0, count)
    .map((r, i) => ({ url: r.url, title: r.title, rank: i + 1 }));
}

async function serper(q: string, count: number): Promise<SearchHit[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'x-api-key': process.env.SERPER_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ q, num: Math.min(count * 2, 20) }),
  });
  if (!res.ok) throw new SearchError(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { organic?: { link: string; title: string }[] };
  return (json.organic ?? []).slice(0, count)
    .map((r, i) => ({ url: r.link, title: r.title, rank: i + 1 }));
}
