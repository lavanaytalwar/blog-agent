import type { DailyPoint } from '../../lib/data/measurement.js';
import styles from './baseline.module.css';

const W = 1120;
const H = 160;
const PAD = 8;

/**
 * The flat line. Rendered server-side as plain SVG — there is no interaction
 * to justify a charting library, and the shape is the message.
 */
export function Baseline({ points }: { points: DailyPoint[] }) {
  if (points.length === 0) {
    return <div className={styles.empty}>No Search Console data loaded yet.</div>;
  }

  const max = Math.max(1, ...points.map((p) => p.clicks));
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.clicks).toFixed(1)}`).join(' ');
  const hits = points.map((p, i) => ({ ...p, i })).filter((p) => p.clicks > 0);

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img"
           aria-label={`Non-brand clicks per day across ${points.length} days, peaking at ${max}`}>
        <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} className={styles.axis} />
        <path d={path} className={styles.line} />
        {hits.map((p) => (
          <circle key={p.date} cx={x(p.i)} cy={y(p.clicks)} r={4} className={styles.dot}>
            <title>{`${p.date}: ${p.clicks} click${p.clicks === 1 ? '' : 's'}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className={styles.caption}>
        <span>{points[0]!.date}</span>
        <span>
          peak {max} · {hits.length} day{hits.length === 1 ? '' : 's'} with a click
        </span>
        <span>{points[points.length - 1]!.date}</span>
      </figcaption>
    </figure>
  );
}
