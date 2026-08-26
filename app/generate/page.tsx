import { keywordCoverage } from '../../lib/data/keywords.js';
import { loadConfig } from '../../lib/config/load.js';
import { Screen, Section, ui } from '../ui.js';
import { GenerateForm } from './form.js';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const { groups, coverage } = await keywordCoverage();
  const { clusters } = loadConfig();

  // Excluded keywords stay visible with their reason. Hiding them invites
  // someone to re-add "helium recommendations" in six months.
  const options = groups.flatMap(({ cluster, keywords }) =>
    keywords.map((k) => ({
      keyword: k.keyword,
      clusterId: k.cluster_id,
      clusterName: cluster?.name ?? 'Unmapped',
      personas: cluster?.personas ?? [],
      // Shown in the picker so the cost of adding a target is visible before
      // it is added, not after the draft comes back 400 words short.
      secondaries: (k.secondary_keywords ?? []).map((sec) => sec.keyword),
      disabled: k.status === 'excluded' || k.postId !== null || !k.cluster_id,
      reason:
        k.status === 'excluded' ? (k.exclusion_reason ?? 'excluded')
        : k.postId !== null ? `already covered by post #${k.postId}`
        : !k.cluster_id ? 'needs a cluster before it can be targeted'
        : (k.entity_risk ?? ''),
    })),
  );

  const personaNames = Object.fromEntries(clusters.personas.map((p) => [p.id, p.name]));

  return (
    <Screen title="Generate" route="/generate">
      <div className={ui.note}>
        {coverage.remaining} of {coverage.usable} targets remain untouched.
      </div>
      <Section heading="Start a draft">
        <GenerateForm options={options} personaNames={personaNames} />
      </Section>
    </Screen>
  );
}
