'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './detail.module.css';

type Props = {
  postId: number;
  status: string;
  attempt: number;
  maxAttempts: number;
  gatesPassed: boolean;
  actor: string | null;
};

export function DecisionPanel({ postId, status, attempt, maxAttempts, gatesPassed, actor }: Props) {
  const router = useRouter();
  const [who, setWho] = useState(actor ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = ['approved', 'discarded', 'published', 'measured'].includes(status);
  const canRegenerate = attempt < maxAttempts;

  async function decide(action: 'approve' | 'discard' | 'regenerate') {
    if (!who.trim()) { setError('Say who is deciding first.'); return; }
    if (action === 'regenerate' && !note.trim()) {
      setError('A regenerate needs a note — it is what the next attempt is told.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      document.cookie = `blogeo_actor=${encodeURIComponent(who.trim())}; path=/; max-age=31536000; samesite=lax`;
      const res = await fetch(`/api/posts/${postId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() || undefined, actor: who.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not record the decision.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (settled) {
    return <p className={styles.railNote}>This post is {status.replace(/_/g, ' ')}. No further decision.</p>;
  }

  return (
    <div className={styles.decision}>
      {/* Vercel deployment protection handles access. This is a label so the
          history is legible — nothing is ever gated on it. */}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Who is deciding</span>
        <input
          className={styles.input}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="your name"
        />
      </label>

      <div className={styles.buttonRow}>
        <button
          className={gatesPassed && !busy ? styles.approve : styles.approveDisabled}
          disabled={!gatesPassed || busy}
          onClick={() => decide('approve')}
          title={gatesPassed ? undefined : 'Approve is unavailable while a gate fails.'}
        >
          Approve
        </button>
        <button className={styles.secondary} disabled={busy} onClick={() => decide('discard')}>
          Discard
        </button>
      </div>

      {!gatesPassed ? (
        <p className={styles.railNote}>
          Approve is unavailable while a gate fails. If the gate is wrong, change the config and
          regenerate — there is no override.
        </p>
      ) : null}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {canRegenerate ? 'Regenerate with a note' : 'Regenerate'}
        </span>
        <textarea
          className={styles.textarea}
          value={note}
          rows={3}
          disabled={!canRegenerate}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should the next attempt do differently?"
        />
      </label>

      {canRegenerate ? (
        <button className={styles.secondary} disabled={busy} onClick={() => decide('regenerate')}>
          Regenerate (attempt {attempt + 1} of {maxAttempts})
        </button>
      ) : (
        <p className={styles.railNote}>
          Both attempts are used. Approve it, discard it, or fix the brief and start fresh.
        </p>
      )}

      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
}
