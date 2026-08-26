import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fingerprint } from './fingerprint.js';

export type Verdict = 'accepted' | 'rejected' | 'excluded' | 'proposed';

export type HistoryEntry = {
  keyword: string;
  fingerprint: string;
  verdict: Verdict;
  reason: string;
  source: string;
  first_seen: string;
};

export type History = { entries: HistoryEntry[] };

const path = () => `${process.env.CONFIG_DIR ?? 'config'}/keyword-history.json`;

export function loadHistory(): History {
  const p = path();
  if (!existsSync(p)) return { entries: [] };
  return JSON.parse(readFileSync(p, 'utf8')) as History;
}

export function saveHistory(history: History): void {
  const sorted = [...history.entries].sort((a, b) => a.keyword.localeCompare(b.keyword));
  writeFileSync(path(), JSON.stringify({
    _rule: 'Every keyword ever seen keeps its fingerprint here forever. A rejected candidate never resurfaces. Committed on purpose, so the memory survives the database.',
    entries: sorted,
  }, null, 2) + '\n');
}

/** Fingerprints already spoken for. Mining must not re-propose these. */
export function seenFingerprints(history: History): Set<string> {
  return new Set(history.entries.map((e) => e.fingerprint));
}

export function record(
  history: History,
  keyword: string,
  verdict: Verdict,
  reason: string,
  source: string,
  today: string,
): History {
  const fp = fingerprint(keyword);
  const existing = history.entries.find((e) => e.fingerprint === fp);
  if (existing) {
    // A verdict can harden (proposed → rejected) but first_seen never moves.
    existing.verdict = verdict;
    existing.reason = reason;
    return history;
  }
  history.entries.push({
    keyword, fingerprint: fp, verdict, reason, source, first_seen: today,
  });
  return history;
}
