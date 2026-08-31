import styles from './ui.module.css';
import type { ReactNode } from 'react';

export function Screen({ title, route, children }: {
  title: string; route: string; children: ReactNode;
}) {
  return (
    <>
      <div className={styles.topbar}>
        <span className={styles.screenTitle}>{title}</span>
        <span className={styles.routeLabel}>{route}</span>
      </div>
      <div className={styles.content}>{children}</div>
    </>
  );
}

export function Section({ heading, aside, children }: {
  heading: string; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionHeading}>{heading}</h2>
        {aside ? <span className={styles.sectionAside}>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE: Record<string, string | undefined> = {
  awaiting_approval: styles.pillAttention,
  failed_gates: styles.pillFail,
  drafted: styles.pillMuted,
  stalled: styles.pillFail,
  approved: styles.pillPass,
  discarded: styles.pillMuted,
  available: styles.pillMuted,
  flagged: styles.pillAttention,
  excluded: styles.pillFail,
  covered: styles.pillPass,
};

/** State is carried by shape and label, not colour alone. */
export function Pill({ value }: { value: string }) {
  return (
    <span className={`${styles.pill} ${STATUS_TONE[value] ?? styles.pillMuted}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{head.map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export { styles as ui };
