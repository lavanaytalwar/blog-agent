'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './form.module.css';

type Option = {
  keyword: string;
  clusterId: string | null;
  clusterName: string;
  personas: string[];
  disabled: boolean;
  reason: string;
};

export function GenerateForm({ options, personaNames }: {
  options: Option[];
  personaNames: Record<string, string>;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [persona, setPersona] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = options.find((o) => o.keyword === keyword);
  const personas = selected?.personas ?? [];
  const ready = Boolean(selected && !selected.disabled && persona);

  async function submit() {
    if (!ready || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          primaryKeyword: selected.keyword,
          clusterId: selected.clusterId,
          personaId: persona,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Generation could not start.');
      router.push(`/posts/${json.postId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Keyword</span>
        <select
          className={styles.input}
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPersona(''); }}
        >
          <option value="">Choose a target…</option>
          {options.map((o) => (
            <option key={o.keyword} value={o.keyword} disabled={o.disabled}>
              {o.keyword}
              {o.disabled ? ` — ${o.reason}` : ` · ${o.clusterName}`}
            </option>
          ))}
        </select>
        {selected?.reason && !selected.disabled ? (
          <span className={styles.help}>{selected.reason}</span>
        ) : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Persona</span>
        <select
          className={styles.input}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          disabled={!selected || selected.disabled}
        >
          <option value="">Choose a reader…</option>
          {personas.map((p) => (
            <option key={p} value={p}>{personaNames[p] ?? p}</option>
          ))}
        </select>
        <span className={styles.help}>
          The strategy gate rejects a draft whose persona is not one of the cluster&apos;s.
        </span>
      </label>

      {error ? <div className={styles.error}>{error}</div> : null}

      <button
        className={ready && !busy ? styles.primary : styles.primaryDisabled}
        disabled={!ready || busy}
        onClick={submit}
      >
        {busy ? 'Starting…' : 'Generate draft'}
      </button>
    </div>
  );
}
