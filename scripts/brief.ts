import '../lib/env.js';
import { assembleBrief } from '../lib/brief/assemble.js';
import { renderSystemPrompt, renderUserMessage } from '../lib/brief/render.js';
import { serpCoverageFor } from '../lib/brief/serp.js';

/**
 * Prints the brief a keyword produces, or the prompt built from it.
 * The prompt is the highest-leverage thing to read before spending tokens.
 */
async function main() {
  const keyword = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
  if (!keyword) {
    console.error('usage: npm run brief -- "<keyword>" [--prompt|--json]');
    process.exit(1);
  }

  const brief = assembleBrief({
    primaryKeyword: keyword,
    serpCoverage: serpCoverageFor(keyword),
  });

  if (process.argv.includes('--json')) { console.log(JSON.stringify(brief, null, 2)); return; }
  if (process.argv.includes('--prompt')) {
    console.log(renderSystemPrompt(brief));
    console.log(`\n${'─'.repeat(60)}\nUSER\n${'─'.repeat(60)}\n${renderUserMessage(brief)}`);
    return;
  }

  console.log(`keyword     ${brief.primaryKeyword}`);
  console.log(`cluster     ${brief.cluster.name} (${brief.cluster.id})`);
  console.log(`persona     ${brief.persona.name}`);
  console.log(`commercial  ${brief.commercialUrl}`);
  console.log(`budget      primary ${brief.budget.primary.join('-')}, secondaries ${brief.budget.secondariesCombined.join('-')} combined`);
  console.log(`secondaries ${brief.secondaries.length || 'none'}`);
  for (const s of brief.secondaries) console.log(`              ${s.source.padEnd(9)} ${s.keyword}`);
  console.log(`claims      ${brief.allowedClaims.length} allowed, ${brief.blockedClaims.length} blocked`);
  console.log(`customers   ${brief.namableCustomers.length} namable`);
  console.log(`serp pages  ${brief.serpCoverage.length}`);
  if (brief.audienceGuard) console.log(`guard       avoid: ${brief.audienceGuard.avoid.slice(0, 4).join(', ')}…`);
  console.log(`\nprompt      ${renderSystemPrompt(brief).length} characters  (npm run brief -- "<kw>" --prompt to read it)`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
