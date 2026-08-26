import { readFileSync } from 'node:fs';

export type Merchant = {
  name: string;
  vertical: string;
  vertical_source: 'inferred' | 'confirmed';
  public: boolean;
  linear_state: string;
};

export type MerchantRoster = {
  internal_projects: string[];
  merchants: Merchant[];
};

let cached: MerchantRoster | null = null;

export function loadMerchants(): MerchantRoster {
  if (!cached) {
    const dir = process.env.CONFIG_DIR ?? 'config';
    cached = JSON.parse(readFileSync(`${dir}/merchants.json`, 'utf8')) as MerchantRoster;
  }
  return cached;
}

/**
 * Fails closed.
 *
 * The merchant roster is known and complete, so any token matching a Linear
 * project name is refused unless that exact merchant is publicly namable.
 * This is a deterministic check rather than a judgment the model re-makes on
 * every run — roughly forty of Helium's fifty-four merchants are confidential,
 * and several are names that would matter if they leaked.
 */
export function confidentialNamesIn(text: string): string[] {
  const { merchants } = loadMerchants();
  const hay = text.toLowerCase();
  return merchants
    .filter((m) => !m.public)
    .filter((m) => new RegExp(`(?<![\\w-])${escape(m.name)}(?![\\w-])`, 'i').test(hay))
    .map((m) => m.name);
}

export function verticalFor(name: string): string | null {
  const { merchants } = loadMerchants();
  const hit = merchants.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
  return hit?.vertical ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
