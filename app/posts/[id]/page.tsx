import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getPost, latestReview, MAX_ATTEMPTS } from '../../../lib/data/posts.js';
import { loadConfig } from '../../../lib/config/load.js';
import { Screen, ui } from '../../ui.js';
import { blocks } from './highlight.js';
import { GateReportPanel } from './gate-report.js';
import { ReviewPanel } from './review-panel.js';
import { DecisionPanel } from './decision.js';
import { Poller } from './poller.js';
import styles from './detail.module.css';

export const dynamic = 'force-dynamic';

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) notFound();

  const { keywords, clusters } = loadConfig();
  const cluster = clusters.clusters.find((c) => c.id === post.cluster_id);
  const keyword = keywords.keywords.find((k) => k.keyword === post.primary_keyword);
  const actor = (await cookies()).get('blogeo_actor')?.value ?? null;
  const review = await latestReview(post.id);

  const generating = post.status === 'drafted' && !post.body_md;
  const body = blocks(post.body_md ?? '', post.gate_report);
  const metaLength = post.meta_description?.length ?? 0;

  return (
    <Screen title={post.title} route={`/posts/${post.id}`}>
      {generating ? <Poller postId={post.id} /> : null}

      <div className={styles.grid}>
        <article className={styles.draft}>
          <h1 className={styles.title}>{post.title}</h1>
          <div className={styles.meta}>
            {post.slug} · {post.cluster_id} · {post.persona_id}
          </div>

          {post.meta_description ? (
            <div className={styles.metaBox}>
              <span>{post.meta_description}</span>
              <span className={metaLength < 140 || metaLength > 160 ? styles.countBad : styles.count}>
                {metaLength} / 140–160
              </span>
            </div>
          ) : null}

          {generating ? (
            <p className={styles.generating}>Generating…</p>
          ) : (
            body.map((block, i) => {
              const content = block.segments.map((seg, j) =>
                seg.highlighted
                  ? <mark key={j} className={styles.mark} title={seg.rule}>{seg.text}</mark>
                  : <span key={j}>{seg.text}</span>,
              );
              if (block.kind === 'h2') return <h2 key={i} className={styles.h2}>{content}</h2>;
              if (block.kind === 'h3') return <h3 key={i} className={styles.h3}>{content}</h3>;
              return <p key={i} className={styles.p}>{content}</p>;
            })
          )}
        </article>

        <aside className={styles.rail}>
          <GateReportPanel report={post.gate_report} />

          <div className={styles.railDivider} />
          <ReviewPanel review={review} />

          <div className={styles.railDivider} />
          <h2 className={styles.railHeading}>Target</h2>
          <dl className={styles.kv}>
            <dt>Keyword</dt><dd>{post.primary_keyword}</dd>
            <dt>Cluster</dt><dd className={ui.mono}>{post.cluster_id}</dd>
            <dt>Persona</dt><dd className={ui.mono}>{post.persona_id}</dd>
            <dt>Commercial URL</dt>
            <dd className={ui.mono}>
              {cluster?.commercial_url.replace('https://www.gethelium.co', '') ?? '—'}
            </dd>
            <dt>SERP rivals</dt><dd className={ui.mono}>{keyword?.serp_competitors?.length ?? 0}</dd>
          </dl>

          <div className={styles.railDivider} />
          <h2 className={styles.railHeading}>Decision</h2>
          <DecisionPanel
            postId={post.id}
            status={post.status}
            attempt={post.attempt}
            maxAttempts={MAX_ATTEMPTS}
            gatesPassed={post.gate_report?.passed ?? false}
            actor={actor}
          />
        </aside>
      </div>
    </Screen>
  );
}
