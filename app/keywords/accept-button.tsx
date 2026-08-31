'use client';

import { useState } from 'react';
import styles from './mine.module.css';

/**
 * The check mark on a mining candidate.
 *
 * Pressing it stages the keyword in `keyword_acceptances` — it does not touch
 * config/keywords.json, because the dashboard has no filesystem. `npm run
 * keywords:apply-accepted` is the step that turns a batch of these into the
 * committed diff. Once accepted, mining stops proposing it, the same way a
 * rejected keyword stops being proposed.
 */
export function AcceptButton({
  keyword, scope, primary, evidence, accepted: initial, onChange,
}: {
  keyword: string;
  scope: 'primary' | 'secondary';
  primary?: string;
  evidence: { impressions: number; clicks?: number; position: number; firstSeen?: string; lastSeen?: string; variants?: string[] };
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (accepted) {
        const res = await fetch('/api/keywords/accept', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ keyword }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not undo that.');
        setAccepted(false);
        onChange(false);
      } else {
        const res = await fetch('/api/keywords/accept', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            keyword, scope, primary,
            impressions: evidence.impressions, clicks: evidence.clicks, position: evidence.position,
            firstSeen: evidence.firstSeen, lastSeen: evidence.lastSeen, variants: evidence.variants ?? [],
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Could not save that.');
        setAccepted(true);
        onChange(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={accepted ? styles.acceptOn : styles.accept}
      title={
        error ||
        (accepted
          ? `Staged — will be added to config/keywords.json on the next apply. Click to undo.`
          : scope === 'primary'
            ? `Accept "${keyword}" as a new target (needs a cluster before it can be generated).`
            : `Accept "${keyword}" as a secondary of "${primary}".`)
      }
      aria-pressed={accepted}
      aria-label={accepted ? `Unaccept ${keyword}` : `Accept ${keyword}`}
    >
      {busy ? '·' : accepted ? '✓' : '+'}
    </button>
  );
}
