'use client';

import { useState } from 'react';
import styles from './mine.module.css';
import { RejectButton } from './reject-button.js';
import { AcceptButton } from './accept-button.js';

type Result = {
  strikingCount: number;
  secondaryCount: number;
  striking: { query: string; impressions: number; position: number; firstSeen?: string; lastSeen?: string }[];
  secondaries: {
    query: string; primary: string; impressions: number; position: number;
    firstSeen?: string; lastSeen?: string; variants?: string[];
  }[];
  primariesWithCandidates: { primary: string; count: number }[];
  thresholds: {
    STRIKING: { minImpressions: number; maxImpressions: number; minPosition: number; maxPosition: number };
  };
};

export function MineButton() {
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState('');
  // Rejecting or accepting from here should strike/check the row, not make it
  // vanish mid-list — it only actually disappears on the next "Check again".
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  async function run() {
    setState('checking');
    try {
      const res = await fetch('/api/keywords/mine', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Mining failed.');
      setResult(json as Result);
      setRejected({});
      setAccepted({});
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
                  <AcceptButton
                    keyword={c.query}
                    scope="primary"
                    evidence={{ impressions: c.impressions, position: c.position, firstSeen: c.firstSeen, lastSeen: c.lastSeen }}
                    accepted={Boolean(accepted[c.query])}
                    onChange={(a) => setAccepted((prev) => ({ ...prev, [c.query]: a }))}
                  />
                  <RejectButton
                    keyword={c.query}
                    scope="primary"
                    rejected={Boolean(rejected[c.query])}
                    onChange={(r) => setRejected((prev) => ({ ...prev, [c.query]: r }))}
                  />
                  <span className={styles.mono}>{c.impressions} imp · pos {c.position}</span>{' '}
                  <span className={rejected[c.query] || accepted[c.query] ? styles.struck : undefined}>{c.query}</span>
                  {accepted[c.query] ? <span className={styles.evidence}>staged — apply to add</span> : null}
                </li>
              ))}
            </ul>
          )}

          {result.secondaries?.length ? (
            <ul className={styles.list}>
              {result.secondaries.map((c) => (
                <li key={`${c.primary}::${c.query}`}>
                  <AcceptButton
                    keyword={c.query}
                    scope="secondary"
                    primary={c.primary}
                    evidence={{
                      impressions: c.impressions, position: c.position,
                      firstSeen: c.firstSeen, lastSeen: c.lastSeen, variants: c.variants,
                    }}
                    accepted={Boolean(accepted[c.query])}
                    onChange={(a) => setAccepted((prev) => ({ ...prev, [c.query]: a }))}
                  />
                  <RejectButton
                    keyword={c.query}
                    scope="secondary"
                    primary={c.primary}
                    rejected={Boolean(rejected[c.query])}
                    onChange={(r) => setRejected((prev) => ({ ...prev, [c.query]: r }))}
                  />
                  <span className={styles.mono}>{c.impressions} imp · pos {c.position}</span>{' '}
                  <span className={rejected[c.query] || accepted[c.query] ? styles.struck : undefined}>{c.query}</span>
                  <span className={styles.evidence}>
                    {c.primary}{accepted[c.query] ? ' · staged — apply to add' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className={styles.note}>
            This check writes nothing on its own. Press <strong>+</strong> to stage a candidate,
            then run <code>npm run keywords:apply-accepted</code> to fold every staged pick into
            config/keywords.json as one committed diff. Press <strong>−</strong> instead to make
            sure a candidate is never proposed again.
          </p>
        </div>
      ) : null}
    </div>
  );
}
