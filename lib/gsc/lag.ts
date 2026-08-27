/**
 * How far behind Search Console runs.
 *
 * GSC has no complete data for roughly the last three days, and keeps revising
 * recent days for about a week after the fact. `gsc-sync` has always ended its
 * pull here; the measurement cron now holds windows for the same reason.
 *
 * This matters far more for a short window than a long one. Three missing days
 * out of 56 is noise. Three out of seven is 43% of the reading, and a +7 window
 * taken on day seven would report a collapse that is really just the lag.
 */
export const LAG_DAYS = 3;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The last date Search Console can be expected to have complete data for. */
export function reportedThrough(now: Date = new Date()): string {
  return iso(new Date(now.getTime() - LAG_DAYS * 86_400_000));
}

/**
 * Whether a window ending on `end` is safe to read yet.
 *
 * Both arguments are ISO dates, so the string comparison is the date
 * comparison. Nothing here builds a Date from a bare date string, which is
 * parsed as UTC midnight and shifts a day for anyone west of Greenwich.
 */
export function windowHasClosed(end: string, now: Date = new Date()): boolean {
  return end <= reportedThrough(now);
}
