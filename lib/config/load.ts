import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Blocklist, ClaimLedger, ClustersConfig, Config, KeywordsConfig,
} from './types.js';

const DIR = process.env.CONFIG_DIR ?? 'config';

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DIR, file), 'utf8')) as T;

let cached: Config | null = null;

/**
 * The JSON in config/ is the source of truth for every gate. Loaded once and
 * cached — these files do not change while a process is running, and the gates
 * are called in tight loops.
 */
export function loadConfig(): Config {
  if (cached) return cached;
  cached = {
    clusters: read<ClustersConfig>('clusters.json'),
    keywords: read<KeywordsConfig>('keywords.json'),
    ledger: read<ClaimLedger>('claim-ledger.json'),
    blocklist: read<Blocklist>('blocklist.json'),
  };
  return cached;
}

/** Tests build their own fixtures rather than depending on live config. */
export function setConfig(config: Config): void {
  cached = config;
}

export function resetConfig(): void {
  cached = null;
}
