'use client';

import { useEffect, useState } from 'react';

/**
 * A timestamp in the reader's timezone.
 *
 * The server's is UTC on Vercel, so formatting there would put a London clock
 * in front of a reader in Bengaluru. The first render, server and client alike,
 * is the UTC form; the effect then replaces it with local time. Same output on
 * both sides of hydration, so there is nothing to mismatch.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    setLocal(new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [iso]);

  return <time dateTime={iso}>{local ?? `${iso.slice(11, 16)} UTC`}</time>;
}
