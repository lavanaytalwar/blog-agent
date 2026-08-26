'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Generation runs after the response is flushed, so the page polls for it. */
export function Poller({ postId }: { postId: number }) {
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/status`, { cache: 'no-store' });
        const json = await res.json();
        if (!stop && json.status !== 'drafted') router.refresh();
      } catch {
        // A failed poll is not worth surfacing; the next one will tell us.
      }
    };
    const timer = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(timer); };
  }, [postId, router]);

  return null;
}
