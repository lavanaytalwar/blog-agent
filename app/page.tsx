import Link from 'next/link';
import { awaitingDecision, listPosts } from '../lib/data/posts.js';
import { keywordCoverage } from '../lib/data/keywords.js';
import { generationState, humanDuration } from '../lib/data/stall.js';
import { Screen, Section, Table, Pill, Empty, ui } from './ui.js';
import { Stopwatch } from './stopwatch.js';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const [queue, recent, { coverage }] = await Promise.all([
    awaitingDecision(),
    listPosts(),
    keywordCoverage(),
  ]);

  const decided = recent.filter((p) => !queue.some((q) => q.id === p.id)).slice(0, 10);

  return (
    <Screen title="Queue" route="/">
      <div className={ui.stats}>
        <div className={ui.stat}>
          <span className={ui.statKey}>Awaiting decision</span>
          <span className={ui.statVal}>{queue.length}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statKey}>Targets remaining</span>
          <span className={ui.statVal}>{coverage.remaining}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statKey}>Covered</span>
          <span className={`${ui.statVal} ${coverage.covered === 0 ? ui.statZero : ''}`}>
            {coverage.covered}
          </span>
        </div>
      </div>

      <Section heading="Awaiting decision" aside={`${queue.length} post(s)`}>
        {queue.length === 0 ? (
          <Empty>
            Nothing is waiting on you. <Link className={ui.link} href="/generate">Generate a draft</Link> to
            start one.
          </Empty>
        ) : (
          <Table head={['Title', 'Keyword', 'Cluster', 'Status', 'Attempt', 'Created']}>
            {queue.map((p) => {
              // A stalled row is still 'drafted' in the database. Showing that
              // raw would repeat the bug this column exists to expose.
              const gen = generationState(p);
              return (
                <tr key={p.id}>
                  <td><Link className={ui.link} href={`/posts/${p.id}`}>{p.title}</Link></td>
                  <td className={ui.sec}>{p.primary_keyword}</td>
                  <td className={ui.mono}>{p.cluster_id}</td>
                  <td>
                    <Pill value={gen.state === 'stalled' ? 'stalled' : p.status} />
                    {gen.state === 'running' ? (
                      <span className={ui.sec}>
                        {' '}<Stopwatch startedAt={gen.startedAt} className={ui.mono} /> in
                      </span>
                    ) : null}
                    {gen.state === 'stalled' ? (
                      <span className={ui.sec}> silent {humanDuration(gen.elapsedMs)}</span>
                    ) : null}
                  </td>
                  <td className={ui.mono}>{p.attempt} / 2</td>
                  <td className={ui.sec}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section heading="Recently decided">
        {decided.length === 0 ? (
          <Empty>No decisions recorded yet.</Empty>
        ) : (
          <Table head={['Title', 'Status', 'Slug']}>
            {decided.map((p) => (
              <tr key={p.id}>
                <td><Link className={ui.link} href={`/posts/${p.id}`}>{p.title}</Link></td>
                <td><Pill value={p.status} /></td>
                <td className={ui.mono}>{p.slug}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </Screen>
  );
}
