import Link from 'next/link';
import { keywordCoverage } from '../../lib/data/keywords.js';
import { listRejections } from '../../lib/keywords/rejections.js';
import { fingerprint } from '../../lib/keywords/fingerprint.js';
import { Screen, Section, Table, Pill, ui } from '../ui.js';
import { MineButton } from './mine-button.js';
import { RejectButton } from './reject-button.js';
import styles from './mine.module.css';

export const dynamic = 'force-dynamic';

export default async function KeywordsPage() {
  const [{ groups, coverage }, rejections] = await Promise.all([
    keywordCoverage(),
    listRejections(),
  ]);
  // Fingerprints, not strings: rejecting one surface form rejects them all.
  const rejected = new Set(rejections.map((r) => r.fingerprint));
  const isRejected = (k: string) => rejected.has(fingerprint(k));

  return (
    <Screen title="Keywords" route="/keywords">
      <div className={ui.note}>
        <strong>{coverage.remaining} targets remaining</strong> of {coverage.usable} usable
        ({coverage.covered} covered, {coverage.excluded} excluded). At one post per prompt this
        list runs dry in roughly three months, and Search Console striking-distance — the
        resupply mechanism — currently returns nothing.
        <br />
        <strong>{coverage.secondariesTotal} secondary keywords</strong> across{' '}
        {coverage.withSecondaries} primaries. The other{' '}
        {coverage.usable - coverage.withSecondaries} have no evidence yet and are recorded
        as <code>none</code> rather than padded with invented terms.
      </div>

      <MineButton />

      {rejections.length > 0 ? (
        <div className={styles.rejectedBlock}>
          <div className={styles.title}>
            {rejections.length} rejected keyword{rejections.length === 1 ? '' : 's'}
          </div>
          <div className={styles.sub}>
            Never proposed again, in any surface form. Run{' '}
            <code>npm run keywords:rejections</code> to write these into
            <code> config/keyword-history.json</code> so the decision survives the database.
          </div>
          <ul className={styles.rejectedList}>
            {rejections.map((r) => (
              <li key={r.fingerprint}>
                <RejectButton
                  keyword={r.keyword}
                  scope={r.scope}
                  primary={r.primaryKeyword ?? undefined}
                  rejected
                />
                <span className={styles.struck}>{r.keyword}</span>
                <span className={styles.evidence}>
                  {r.scope === 'secondary' && r.primaryKeyword ? `secondary of ${r.primaryKeyword}` : r.scope}
                  {' · '}{r.rejectedAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {groups.map(({ cluster, keywords }) => (
        <Section
          key={cluster?.id ?? 'unmapped'}
          heading={cluster ? cluster.name : 'Unmapped'}
          aside={`${keywords.length} keyword(s)${cluster ? ` · ${cluster.commercial_url.replace('https://www.gethelium.co', '')}` : ''}`}
        >
          <Table head={['Keyword', 'Status', 'Secondaries', 'Post', 'SERP rivals', 'Note']}>
            {keywords.map((k) => {
              const secondaries = k.secondary_keywords ?? [];
              return (
                <tr key={k.keyword}>
                  <td>
                    <span className={styles.keywordRow}>
                      <RejectButton keyword={k.keyword} scope="primary" rejected={isRejected(k.keyword)} />
                      <span className={isRejected(k.keyword) ? styles.struck : undefined}>{k.keyword}</span>
                    </span>
                    {secondaries.length > 0 ? (
                      <ul className={styles.secondaryList}>
                        {secondaries.map((s) => (
                          <li key={s.keyword} className={s.source === 'proposed' ? styles.proposed : undefined}>
                            <RejectButton
                              keyword={s.keyword}
                              scope="secondary"
                              primary={k.keyword}
                              rejected={isRejected(s.keyword)}
                            />
                            <span className={isRejected(s.keyword) ? styles.struck : undefined}>{s.keyword}</span>
                            {/* A proposed term is awaiting a decision, not a finding.
                                It must never read as evidence-backed. */}
                            {s.source === 'proposed' ? (
                              <span className={styles.proposedTag}>proposed</span>
                            ) : null}
                            <span className={styles.evidence}>
                              {s.source === 'gsc'
                                ? `${s.impressions} imp · pos ${s.position}`
                                : (s.evidence ?? s.source)}
                              {s.variants?.length ? ` · +${s.variants.length} variant${s.variants.length === 1 ? '' : 's'}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td><Pill value={k.postId ? 'covered' : k.status} /></td>
                  <td className={`${ui.mono} ${ui.num}`}>
                    {k.status === 'excluded'
                      ? '—'
                      : secondaries.length > 0
                        ? `${secondaries.length} ${k.secondary_source}`
                        : <span className={ui.sec}>none</span>}
                  </td>
                  <td className={ui.mono}>
                    {k.postId
                      ? <Link className={ui.link} href={`/posts/${k.postId}`}>#{k.postId}</Link>
                      : '—'}
                  </td>
                  <td className={`${ui.mono} ${ui.num}`}>{k.serpCount || '—'}</td>
                  <td className={ui.sec}>{k.exclusion_reason ?? k.entity_risk ?? k.note ?? ''}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
      ))}
    </Screen>
  );
}
