'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import styles from './form.module.css';

type Option = {
  keyword: string;
  clusterId: string | null;
  clusterName: string;
  personas: string[];
  secondaries: string[];
  disabled: boolean;
  reason: string;
};

/** Matches lib/gates/structure.ts. Shown so the word cost is visible up front. */
const MIN_WORDS = 500;
const WORDS_PER_ADDITIONAL_TARGET = 250;

export function GenerateForm({ options, personaNames }: {
  options: Option[];
  personaNames: Record<string, string>;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [also, setAlso] = useState<string[]>([]);
  const [persona, setPersona] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = options.find((o) => o.keyword === keyword);
  const personas = selected?.personas ?? [];
  const ready = Boolean(selected && !selected.disabled && persona);

  // One post covers one cluster: the persona, the commercial URL and the
  // audience guard all hang off it, so a cross-cluster selection has no single
  // correct answer. The picker only ever offers what is legal.
  const companions = useMemo(
    () => (selected
      ? options.filter((o) => !o.disabled && o.clusterId === selected.clusterId && o.keyword !== selected.keyword)
      : []),
    [options, selected],
  );

  const chosen = also.filter((k) => companions.some((c) => c.keyword === k));
  const targetCount = chosen.length + 1;
  const secondaryCount = (selected?.secondaries.length ?? 0)
    + chosen.reduce((n, k) => n + (companions.find((c) => c.keyword === k)?.secondaries.length ?? 0), 0);

  function toggle(k: string) {
    setAlso((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

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
          additionalKeywords: chosen,
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
        <span className={styles.label}>Lead keyword</span>
        <select
          className={styles.input}
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPersona(''); setAlso([]); }}
        >
          <option value="">Choose a target…</option>
          {options.map((o) => (
            <option key={o.keyword} value={o.keyword} disabled={o.disabled}>
              {o.keyword}
              {o.disabled ? ` — ${o.reason}` : ` · ${o.clusterName}`}
            </option>
          ))}
        </select>
        <span className={styles.help}>
          Owns the slug, title, H1 and meta description.
        </span>
        {selected?.reason && !selected.disabled ? (
          <span className={styles.help}>{selected.reason}</span>
        ) : null}
      </label>

      {selected && !selected.disabled ? (
        <div className={styles.field}>
          <span className={styles.label}>Also cover ({chosen.length})</span>
          {companions.length === 0 ? (
            <span className={styles.help}>
              No other untouched targets in {selected.clusterName}. This post covers one keyword.
            </span>
          ) : (
            <>
              <div className={styles.checklist}>
                {companions.map((c) => (
                  <label key={c.keyword} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(c.keyword)}
                      onChange={() => toggle(c.keyword)}
                    />
                    <span>
                      {c.keyword}
                      <span className={styles.count}>
                        {c.secondaries.length} secondar{c.secondaries.length === 1 ? 'y' : 'ies'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <span className={styles.help}>
                Each one selected is enforced like the lead: it needs its own H2, at least
                three uses, and its secondary keywords are required too. Only keywords in{' '}
                {selected.clusterName} are offered — one post covers one cluster.
              </span>
            </>
          )}
        </div>
      ) : null}

      {selected && !selected.disabled ? (
        <div className={styles.budget}>
          <strong>{targetCount}</strong> target{targetCount === 1 ? '' : 's'} ·{' '}
          <strong>{secondaryCount}</strong> secondary keyword{secondaryCount === 1 ? '' : 's'} ·
          word floor <strong>{MIN_WORDS + chosen.length * WORDS_PER_ADDITIONAL_TARGET}</strong>
        </div>
      ) : null}

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
        {busy ? 'Starting…' : `Generate draft${targetCount > 1 ? ` · ${targetCount} targets` : ''}`}
      </button>
    </div>
  );
}
