/**
 * Is a post being written right now, or did its generation die?
 *
 * `status = 'drafted'` covers both. Generation runs inside the request that
 * asked for it, via `after()`, so anything that kills that invocation — a
 * serverless timeout, a deploy, a cold start, a crash — takes the run with it
 * before either the success write or the error write in `generateForPost` can
 * happen. The row is left exactly as a healthy in-progress row looks.
 *
 * The distinction is therefore time, and nothing else: a generation that has
 * been going longer than any real one takes is not going.
 */

/**
 * How long a generation may run before the dashboard calls it dead.
 *
 * Measured, not guessed. The slowest observed real run is 578s for a draft on a
 * 1363 to 1772 word target at `think: max`, and 401s end to end including the
 * review pass on a 700 to 1200 word target. Fifteen minutes clears the slowest
 * of those with room to spare, so a post declared stalled is genuinely stalled
 * rather than merely slow. Lower this if the think level comes down and the
 * measurements move with it.
 */
export const STALL_AFTER_MS = 15 * 60_000;

export type GenerationState =
  /** Not generating: the draft is written, or the post is already decided. */
  | { state: 'idle' }
  | { state: 'running'; startedAt: string; elapsedMs: number }
  | { state: 'stalled'; startedAt: string; elapsedMs: number };

/** The subset of a post row this needs. Keeps the CLI and the dashboard honest. */
export type StallInput = {
  status: string;
  body_md: string | null;
  created_at: string | Date;
  generation_started_at: string | Date | null;
};

export function generationState(post: StallInput, now = Date.now()): GenerationState {
  if (post.status !== 'drafted' || post.body_md) return { state: 'idle' };

  // A row whose generation never recorded a start was dropped before the first
  // statement ran, which is its own failure mode and not a reason to call it
  // idle. Fall back to the insert, the only other timestamp there is.
  const started = new Date(post.generation_started_at ?? post.created_at);
  const startedAt = started.toISOString();
  const elapsedMs = Math.max(0, now - started.getTime());

  return elapsedMs >= STALL_AFTER_MS
    ? { state: 'stalled', startedAt, elapsedMs }
    : { state: 'running', startedAt, elapsedMs };
}

/** "7 min", "1 h 12 min". Whole units only; this is a glance, not a stopwatch. */
export function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
