'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Generation runs after the response is flushed, so the page polls for it.
 *
 * Two things end the poll: the status leaving 'drafted', which is the happy
 * path, and the server declaring the run stalled, which is the path that used
 * to spin forever. Either way the interval is cleared rather than left ticking
 * against a page that has already been refreshed.
 */
export function Poller({ postId }: { postId: number }) {
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (stop) return;
        if (json.status !== 'drafted' || json.generation === 'stalled') {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // A failed poll is not worth surfacing; the next one will tell us.
      }
    };

    timer = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(timer); };
  }, [postId, router]);

  return null;
}
