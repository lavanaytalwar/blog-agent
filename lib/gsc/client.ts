import { getAccessToken } from './auth.js';

export type Dimension = 'date' | 'page' | 'query' | 'country' | 'device';

export type Row = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type QueryOptions = {
  startDate: string;
  endDate: string;
  dimensions?: Dimension[];
  rowLimit?: number;
  startRow?: number;
  filters?: { dimension: Dimension; operator: string; expression: string }[];
};

const site = () => process.env.GSC_SITE ?? 'sc-domain:gethelium.co';

const endpoint = () =>
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site())}/searchAnalytics/query`;

async function queryOnce(opts: QueryOptions): Promise<Row[]> {
  const token = await getAccessToken();
  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions ?? [],
    rowLimit: opts.rowLimit ?? 1000,
    startRow: opts.startRow ?? 0,
  };
  if (opts.filters?.length) {
    body.dimensionFilterGroups = [{ filters: opts.filters }];
  }

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`GSC query failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { rows?: Row[] };
  return json.rows ?? [];
}

/** Pages through the API until it runs dry. GSC caps a page at 25,000 rows. */
export async function query(opts: QueryOptions): Promise<Row[]> {
  const pageSize = Math.min(opts.rowLimit ?? 5000, 25000);
  const out: Row[] = [];
  let startRow = 0;

  for (;;) {
    const rows = await queryOnce({ ...opts, rowLimit: pageSize, startRow });
    out.push(...rows);
    if (rows.length < pageSize) break;
    startRow += pageSize;
    if (startRow > 100000) break; // sanity stop; nothing here is that big
  }
  return out;
}

/** Totals with no dimension breakdown. */
export async function totals(startDate: string, endDate: string) {
  const rows = await queryOnce({ startDate, endDate, dimensions: [], rowLimit: 1 });
  return rows[0] ?? { keys: [], clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export async function listSites() {
  const token = await getAccessToken();
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GSC sites list failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
}
