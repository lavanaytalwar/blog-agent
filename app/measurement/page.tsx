import { leadingIndicators, nonBrandDaily } from '../../lib/data/measurement.js';
import { Screen, Section, ui } from '../ui.js';
import { Baseline } from './baseline.js';

export const dynamic = 'force-dynamic';

export default async function MeasurementPage() {
  const [daily, indicators] = await Promise.all([nonBrandDaily(), leadingIndicators()]);

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
          {indicators.brandedClicks} branded ones. It keeps accruing nightly whether or not
          anything is published, which is the half of the measurement spine that had to be
          started early — a baseline can only be captured going forward.
        </p>
      </Section>

      {/* Per-post readings are retired, not broken. This engine stops at an
          approved draft; publishing is a manual paste into the CMS, so nothing
          here knows a post's live URL or the date it went up, and a +7 window
          has nothing to count from. The measurements table is still in place
          for whenever that changes. */}
      <Section heading="Per-post readings">
        <p className={ui.sec} style={{ fontSize: 13, lineHeight: 1.6 }}>
          Not collected. The engine's job ends at an approved draft, and publishing happens
          by hand outside it, so no post here carries a live URL or a go-live date to measure
          from. Attribution needs both. Until publishing is recorded somewhere, the blog-wide
          baseline above is the honest reading, and inventing a per-post number from an
          approval date would be a worse answer than no number.
        </p>
      </Section>
    </Screen>
  );
}
