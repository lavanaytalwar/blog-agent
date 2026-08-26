import Link from 'next/link';
import { keywordCoverage } from '../../lib/data/keywords.js';
import { Screen, Section, Table, Pill, ui } from '../ui.js';
import { MineButton } from './mine-button.js';
import styles from './mine.module.css';

export const dynamic = 'force-dynamic';

export default async function KeywordsPage() {
  const { groups, coverage } = await keywordCoverage();

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
                    {k.keyword}
                    {secondaries.length > 0 ? (
                      <ul className={styles.secondaryList}>
                        {secondaries.map((s) => (
                          <li key={s.keyword} className={s.source === 'proposed' ? styles.proposed : undefined}>
                            {s.keyword}
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
