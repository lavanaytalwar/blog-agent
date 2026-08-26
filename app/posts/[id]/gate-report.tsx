import type { GateReport } from '../../../lib/gates/types.js';
import styles from './detail.module.css';

const ORDER = ['strategy', 'structure', 'provenance', 'cannibalization', 'tone_floor'] as const;

/**
 * Every gate is always listed, passing or not. A panel that shows only
 * failures makes "passed" indistinguishable from "did not run".
 */
export function GateReportPanel({ report }: { report: GateReport | null }) {
  if (!report) {
    return (
      <>
        <h2 className={styles.railHeading}>Gate report</h2>
        <p className={styles.railNote}>Not run yet.</p>
      </>
    );
  }

  const byName = new Map(report.results.map((r) => [r.gate, r]));

  return (
    <>
      <h2 className={styles.railHeading}>Gate report</h2>
      {ORDER.map((name) => {
        const gate = byName.get(name);
        const passed = gate?.passed ?? false;
        return (
          <div key={name} className={styles.gate}>
            <div className={styles.gateHead}>
              <span className={passed ? styles.gatePass : styles.gateFail}>
                {passed ? '✓' : '✗'} {name}
              </span>
              <span className={styles.gateCount}>
                {!gate || gate.failures.length === 0 ? '—' : gate.failures.length}
              </span>
            </div>
            {gate?.failures.map((f, i) => (
              <div key={i} className={styles.failure}>
                <div className={styles.failureRule}>{f.rule}</div>
                <div className={styles.failureMessage}>{f.message}</div>
                {f.evidence ? <div className={styles.failureEvidence}>{f.evidence}</div> : null}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
