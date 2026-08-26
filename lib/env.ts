/**
 * Loads .env.local then .env into process.env, using Node's built-in loader
 * (>=21.7) so there is no dotenv dependency. Later files do not overwrite
 * variables already set, so a real environment always wins over a local file.
 *
 * .env.local is what `vercel env pull` writes; .env is hand-maintained.
 */
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      // A malformed file should not take down a script that may not need it.
      console.warn(`  ! could not parse ${file}`);
    }
  }
}
