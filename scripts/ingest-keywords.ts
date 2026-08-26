/**
 * Refreshes config/keywords.json from the Google Sheet.
 *
 * The sheet is a human artefact that changes rarely, so this is a manual step
 * rather than a sync — the generated file is version-controlled on purpose, so
 * a change to targeting shows up in a diff.
 *
 * Cluster assignment is NOT inferred. New keywords land with cluster_id null
 * and status 'unmapped'; gate 1 rejects them until a human maps them in
 * config/clusters.json. Guessing the cluster would quietly break persona
 * targeting.
 */
import ExcelJS from 'exceljs';
import { readFile, writeFile } from 'node:fs/promises';

const SHEET_ID = '1NSLIqpO2W4GmTK3ZxiEPTD0KNNbdN3iyljzeVFtpxEY';
const EXPORT = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const OUT = 'config/keywords.json';

type Keyword = Record<string, unknown> & { keyword: string; cluster_id: string | null; status: string };

async function main() {
  const res = await fetch(EXPORT);
  if (!res.ok) throw new Error(`sheet export failed: ${res.status} — is link sharing on?`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());

  const existing = JSON.parse(await readFile(OUT, 'utf8')) as { keywords: Keyword[] };
  const known = new Map(existing.keywords.map((k) => [k.keyword, k]));

  const found = new Set<string>();
  for (const tabName of ['Keyword Strategy', 'Sheet2']) {
    const ws = wb.getWorksheet(tabName);
    if (!ws) { console.warn(`  ! tab "${tabName}" not found — sheet structure changed`); continue; }
    ws.eachRow((row, i) => {
      if (i <= 1) return;
      const kw = String(row.getCell(1).value ?? '').trim();
      if (!kw || kw.startsWith('HELIUM') || kw.startsWith('Helium should') || kw.startsWith('These searches')) return;
      found.add(kw);
      if (!known.has(kw)) {
        known.set(kw, {
          keyword: kw, cluster_id: null, status: 'unmapped',
          outline: String(row.getCell(2).value ?? '').trim() || null,
          serp_competitors: [], clean_room_top5: [], push_target: null,
          source: `sheet:${tabName}`,
        });
        console.log(`  + new: ${kw}  (needs a cluster)`);
      }
    });
  }

  for (const [kw, entry] of known) {
    if (!found.has(kw) && entry.status !== 'covered' && !String(entry.source ?? '').includes('problem-led')) {
      console.log(`  - gone from sheet: ${kw}`);
    }
  }

  const doc = {
    ...existing,
    _generated_at: new Date().toISOString().slice(0, 10),
    keywords: [...known.values()].sort((a, b) =>
      Number(a.status === 'excluded') - Number(b.status === 'excluded') ||
      String(a.cluster_id ?? 'zzz').localeCompare(String(b.cluster_id ?? 'zzz')) ||
      a.keyword.localeCompare(b.keyword)),
  };
  await writeFile(OUT, JSON.stringify(doc, null, 2) + '\n');

  const unmapped = doc.keywords.filter((k) => k.status === 'unmapped');
  console.log(`\n${doc.keywords.length} keywords written.`);
  if (unmapped.length) console.log(`${unmapped.length} need a cluster before they can be targeted.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
