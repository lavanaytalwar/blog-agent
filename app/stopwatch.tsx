'use client';

import { useEffect, useState } from 'react';

function format(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * A live-ticking elapsed-time counter for a generation in progress.
 *
 * `humanDuration` from lib/data/stall gives a glance-value that is only as
 * fresh as the last server render. This ticks on the client every second so a
 * post that is actually still generating visibly moves, instead of sitting at
 * whatever number the page loaded with until the next poll or refresh.
 */
export function Stopwatch({ startedAt, className }: { startedAt: string; className?: string }) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (elapsed === null) return null;
  return <span className={className}>{format(elapsed)}</span>;
}
