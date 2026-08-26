import Link from 'next/link';
import { keywordCoverage } from '../../lib/data/keywords.js';
import { Screen, Section, Table, Pill, ui } from '../ui.js';

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
      </div>

      {groups.map(({ cluster, keywords }) => (
        <Section
          key={cluster?.id ?? 'unmapped'}
          heading={cluster ? cluster.name : 'Unmapped'}
          aside={`${keywords.length} keyword(s)${cluster ? ` · ${cluster.commercial_url.replace('https://www.gethelium.co', '')}` : ''}`}
        >
          <Table head={['Keyword', 'Status', 'Post', 'SERP rivals', 'Note']}>
            {keywords.map((k) => (
              <tr key={k.keyword}>
                <td>{k.keyword}</td>
                <td><Pill value={k.postId ? 'covered' : k.status} /></td>
                <td className={ui.mono}>
                  {k.postId
                    ? <Link className={ui.link} href={`/posts/${k.postId}`}>#{k.postId}</Link>
                    : '—'}
                </td>
                <td className={`${ui.mono} ${ui.num}`}>{k.serpCount || '—'}</td>
                <td className={ui.sec}>{k.exclusion_reason ?? k.entity_risk ?? k.note ?? ''}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ))}
    </Screen>
  );
}
