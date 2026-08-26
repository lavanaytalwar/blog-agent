import Link from 'next/link';
import { listPosts } from '../../lib/data/posts.js';
import { Screen, Section, Table, Pill, Empty, ui } from '../ui.js';

export const dynamic = 'force-dynamic';

export default async function PostsPage() {
  const posts = await listPosts();

  return (
    <Screen title="Posts" route="/posts">
      <Section heading="All posts" aside={`${posts.length} total`}>
        {posts.length === 0 ? (
          <Empty>No posts yet. Start one from <Link className={ui.link} href="/generate">Generate</Link>.</Empty>
        ) : (
          <Table head={['Title', 'Slug', 'Keyword', 'Cluster', 'Status', 'Gates', 'Created']}>
            {posts.map((p) => {
              const failures = p.gate_report?.failureCount ?? null;
              return (
                <tr key={p.id}>
                  <td><Link className={ui.link} href={`/posts/${p.id}`}>{p.title}</Link></td>
                  <td className={ui.mono}>{p.slug}</td>
                  <td className={ui.sec}>{p.primary_keyword}</td>
                  <td className={ui.mono}>{p.cluster_id}</td>
                  <td><Pill value={p.status} /></td>
                  <td className={ui.mono}>
                    {failures === null ? '—' : failures === 0 ? '5/5 pass' : `${failures} fail`}
                  </td>
                  <td className={ui.sec}>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </Screen>
  );
}
