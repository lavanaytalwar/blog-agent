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

export type SearchProvider = 'brave' | 'serper' | 'none';

export function searchProvider(): SearchProvider {
  if (process.env.BRAVE_SEARCH_KEY) return 'brave';
  if (process.env.SERPER_API_KEY) return 'serper';
  return 'none';
}

export class SearchError extends Error {}

export async function topResults(keyword: string, count = 6): Promise<SearchHit[]> {
  const provider = searchProvider();
  if (provider === 'brave') return brave(keyword, count);
  if (provider === 'serper') return serper(keyword, count);
  throw new SearchError(
    'No search provider configured. Set BRAVE_SEARCH_KEY or SERPER_API_KEY, '
    + 'or pass the result URLs on the command line.',
  );
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
