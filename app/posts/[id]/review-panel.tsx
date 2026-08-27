import { CHECK_IDS, CHECKS } from '../../../lib/review/checks.js';
import type { Review } from '../../../lib/review/types.js';
import styles from './detail.module.css';

const MARK = { ok: '·', weak: '!', missing: '×' } as const;

/**
 * The advisory review, rendered below the gate report and deliberately unlike
 * it: no tick and cross, no count of failures, no colour shared with a gate
 * failure. Nothing on this panel blocks approval and the panel says so, because
 * a reviewer who reads it as a second gate will start treating a weak note as a
 * reason a post cannot ship.
 */
export function ReviewPanel({ review }: { review: Review | null }) {
  if (!review) {
    return (
      <>
        <Heading />
        <p className={styles.railNote}>Not run yet.</p>
      </>
    );
  }

  if (review.status === 'unavailable') {
    return (
      <>
        <Heading />
        <p className={styles.railNote}>
          Unavailable. {review.reason}
        </p>
      </>
    );
  }

  const byCheck = new Map(review.notes.map((n) => [n.check, n]));
  const weak = review.notes.filter((n) => n.verdict !== 'ok').length;

  return (
    <>
      <Heading />
      <p className={styles.railNote}>
        {weak === 0
          ? `Nothing flagged across ${review.notes.length} checks.`
          : `${weak} of ${review.notes.length} checks flagged.`}
      </p>

      {CHECK_IDS.map((id) => {
        const note = byCheck.get(id);
        // Every check is listed whether or not it came back, so "read and fine"
        // stays distinguishable from "the reviewer never reported on this".
        if (!note) {
          return (
            <div key={id} className={styles.reviewRow}>
              <div className={styles.reviewCheckMuted}>{id}</div>
              <div className={styles.reviewNote}>Not reported.</div>
            </div>
          );
        }
        const flagged = note.verdict !== 'ok';
        return (
          <div key={id} className={styles.reviewRow}>
            <div className={flagged ? styles.reviewCheckFlagged : styles.reviewCheckMuted}>
              {MARK[note.verdict]} {id}
            </div>
            <div className={styles.reviewNote} title={CHECKS[id]}>{note.note}</div>
            {note.quote ? <div className={styles.reviewQuote}>“{note.quote}”</div> : null}
          </div>
        );
      })}
    </>
  );
}

function Heading() {
  return (
    <>
      <h2 className={styles.railHeading}>Review, advisory</h2>
      <p className={styles.railAside}>Does not gate. Approval is unaffected.</p>
    </>
  );
}
