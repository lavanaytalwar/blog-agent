'use client';

import { useState } from 'react';
import styles from './mine.module.css';
import { RejectButton } from './reject-button.js';

type Result = {
  strikingCount: number;
  secondaryCount: number;
  striking: { query: string; impressions: number; position: number }[];
  secondaries: { query: string; primary: string; impressions: number; position: number }[];
  primariesWithCandidates: { primary: string; count: number }[];
  thresholds: {
    STRIKING: { minImpressions: number; maxImpressions: number; minPosition: number; maxPosition: number };
  };
};

export function MineButton() {
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState('');
  // Rejecting from here should strike the row out, not make it vanish mid-list.
  const [rejected, setRejected] = useState<Record<string, boolean>>({});

  async function run() {
    setState('checking');
    try {
      const res = await fetch('/api/keywords/mine', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Mining failed.');
      setResult(json as Result);
      setRejected({});
      setState('done');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }

  const s = result?.thresholds.STRIKING;

  return (
    <div className={styles.block}>
      <div className={styles.row}>
        <div>
          <div className={styles.title}>Check Search Console for new keywords</div>
          <div className={styles.sub}>
            Striking-distance primaries and secondary candidates, deduplicated against
            everything already targeted, previously seen, or rejected. Press − on any
            candidate to keep it off every future run.
          </div>
        </div>
        <button className={styles.button} disabled={state === 'checking'} onClick={run}>
          {state === 'checking' ? 'Checking…' : state === 'done' ? 'Check again' : 'Check now'}
        </button>
      </div>

      {state === 'error' ? <div className={styles.error}>{message}</div> : null}

      {state === 'done' && result ? (
        <div className={styles.result}>
          <strong>{result.strikingCount}</strong> striking-distance candidate
          {result.strikingCount === 1 ? '' : 's'}
          {s ? ` (${s.minImpressions}–${s.maxImpressions} impressions, position ${s.minPosition}–${s.maxPosition}, not already targeted, not previously rejected)` : ''}.
          {' '}
          <strong>{result.secondaryCount}</strong> secondary candidate
          {result.secondaryCount === 1 ? '' : 's'} across{' '}
          {result.primariesWithCandidates.length} primar
          {result.primariesWithCandidates.length === 1 ? 'y' : 'ies'}.

          {result.strikingCount === 0 ? (
            <p className={styles.note}>
              An empty result is the correct answer today, not a broken check — Helium
              holds no non-brand rankings in the 11–20 band, inside the{' '}
              {s ? `${s.minImpressions}–${s.maxImpressions}` : ''} impression band, to promote.
            </p>
          ) : (
            <ul className={styles.list}>
              {result.striking.map((c) => (
                <li key={c.query}>
                  <RejectButton
                    keyword={c.query}
                    scope="primary"
                    rejected={Boolean(rejected[c.query])}
                    onChange={(r) => setRejected((prev) => ({ ...prev, [c.query]: r }))}
                  />
                  <span className={styles.mono}>{c.impressions} imp · pos {c.position}</span>{' '}
                  <span className={rejected[c.query] ? styles.struck : undefined}>{c.query}</span>
                </li>
              ))}
            </ul>
          )}

          {result.secondaries?.length ? (
            <ul className={styles.list}>
              {result.secondaries.map((c) => (
                <li key={`${c.primary}::${c.query}`}>
                  <RejectButton
                    keyword={c.query}
                    scope="secondary"
                    primary={c.primary}
                    rejected={Boolean(rejected[c.query])}
                    onChange={(r) => setRejected((prev) => ({ ...prev, [c.query]: r }))}
                  />
                  <span className={styles.mono}>{c.impressions} imp · pos {c.position}</span>{' '}
                  <span className={rejected[c.query] ? styles.struck : undefined}>{c.query}</span>
                  <span className={styles.evidence}>{c.primary}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className={styles.note}>
            This check writes nothing. Run the <code>gsc-keywords</code> skill to classify
            candidates and apply them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
