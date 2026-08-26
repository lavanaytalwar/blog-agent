import { leadingIndicators, measurements, nonBrandDaily } from '../../lib/data/measurement.js';
import { Screen, Section, Table, Empty, ui } from '../ui.js';
import { Baseline } from './baseline.js';

export const dynamic = 'force-dynamic';

export default async function MeasurementPage() {
  const [daily, indicators, rows] = await Promise.all([
    nonBrandDaily(), leadingIndicators(), measurements(),
  ]);

  return (
    <Screen title="Measurement" route="/measurement">
      <div className={ui.stats}>
        <div className={ui.stat}>
          <span className={ui.statKey}>Non-brand clicks</span>
          <span className={`${ui.statVal} ${indicators.nonBrandClicks === 0 ? ui.statZero : ''}`}>
            {indicators.nonBrandClicks}
          </span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statKey}>Non-brand queries</span>
          <span className={ui.statVal}>{indicators.nonBrandQueriesWithImpressions}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statKey}>Branded clicks</span>
          <span className={ui.statVal}>{indicators.brandedClicks}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statKey}>Days of history</span>
          <span className={ui.statVal}>{indicators.days}</span>
        </div>
      </div>

      <Section
        heading={`Blog-wide non-brand clicks · ${indicators.days} days`}
        aside={daily.length ? `${daily[0]!.date} → ${daily[daily.length - 1]!.date}` : undefined}
      >
        <Baseline points={daily} />
        <p className={ui.sec} style={{ fontSize: 13, lineHeight: 1.6, marginTop: 12 }}>
          This is the before-picture. Across {indicators.days} days the blog earned{' '}
          <strong>{indicators.nonBrandClicks} non-brand click
          {indicators.nonBrandClicks === 1 ? '' : 's'}</strong> against{' '}
          {indicators.brandedClicks} branded ones. Every non-brand click this engine
          later produces is unambiguously its own — which is the whole reason the
          measurement spine was built before anything else.
        </p>
      </Section>

      <Section heading="Per-post readings" aside={`${rows.length} reading(s)`}>
        {rows.length === 0 ? (
          <Empty>
            Nothing published through the system yet, so there is nothing to measure.
            Readings appear here at +28 and +56 days, each beside the blog-wide control
            for the same window. A reading without its control is not shown at all — it
            would imply an attribution the data cannot support.
          </Empty>
        ) : (
          <Table head={['Post', 'Published', 'Window', 'Post non-brand clicks', 'Blog-wide control']}>
            {rows.map((r) => (
              <tr key={`${r.post_id}-${r.window_label}`}>
                <td>{r.title}</td>
                <td className={ui.sec}>{r.published_at?.slice(0, 10) ?? '—'}</td>
                <td className={ui.mono}>{r.window_label}</td>
                <td className={`${ui.mono} ${ui.num}`}>{r.post_nonbrand_clicks ?? '—'}</td>
                <td className={`${ui.mono} ${ui.num}`}>{r.blogwide_nonbrand_clicks ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </Screen>
  );
}
