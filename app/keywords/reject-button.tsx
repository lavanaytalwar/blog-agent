'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './mine.module.css';

/**
 * The minus sign on every keyword.
 *
 * Pressing it adds the keyword to the rejection list, which mining subtracts on
 * the next run — so a term you have said no to is never proposed again, in any
 * of its surface forms. Pressing it again undoes that.
 *
 * It does not remove an already-targeted keyword from config/keywords.json.
 * That file is committed and changes in a diff, not from a button.
 */
export function RejectButton({
  keyword, scope = 'primary', primary, rejected: initial, onChange,
}: {
  keyword: string;
  scope?: 'primary' | 'secondary';
  primary?: string;
  rejected: boolean;
  /** Supplied when the caller holds its own state instead of re-rendering the page. */
  onChange?: (rejected: boolean) => void;
}) {
  const [rejected, setRejected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    const next = !rejected;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/keywords/rejections', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword, scope, primary }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save that.');
      setRejected(next);
      if (onChange) onChange(next);
      else startTransition(() => router.refresh());
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
      className={rejected ? styles.rejectOn : styles.reject}
      title={
        error ||
        (rejected
          ? `Rejected — mining will not propose "${keyword}" again. Click to restore.`
          : `Reject "${keyword}" so it is never proposed again.`)
      }
      aria-pressed={rejected}
      aria-label={rejected ? `Restore ${keyword}` : `Reject ${keyword}`}
    >
      {busy ? '·' : rejected ? '+' : '−'}
    </button>
  );
}
