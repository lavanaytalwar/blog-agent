import '../lib/env.js';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, hasDatabase } from '../lib/db/index.js';

const DIR = 'migrations';

async function main() {
  if (!hasDatabase()) {
    console.error('DATABASE_URL is not set — nothing to migrate. See .env.example.');
    process.exit(1);
  }
  const db = sql();

  await db`create table if not exists migrations_applied (
    name text primary key, applied_at timestamptz not null default now())`;

  const rows = await db`select name from migrations_applied`;
  const applied = new Set(rows.map((r) => r.name as string));

  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const text = await readFile(join(DIR, file), 'utf8');
    // Neon's HTTP driver takes one statement per call. Strip whole-line comments
    // FIRST, then split — otherwise a leading comment block gets glued to the
    // statement after it and a naive startsWith('--') filter silently drops that
    // statement. (It did. The first table went missing.)
    const statements = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) await db(statement);
    await db`insert into migrations_applied (name) values (${file})`;
    console.log(`  apply ${file}  (${statements.length} statements)`);
    ran++;
  }
  console.log(ran ? `\n${ran} migration(s) applied.` : '\nAlready up to date.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
