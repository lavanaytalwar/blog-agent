import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runGates, strategyGate, structureGate, provenanceGate, cannibalizationGate, toneFloorGate } from './index.js';
import { draft, emptyContext, passingDraft } from './fixtures.js';
import { extractNumerals, ledgerForms } from './numerals.js';
import { containsPhrase, headings, sentences, bodyProse } from './text.js';

const rules = (r: { failures: { rule: string }[] }) => r.failures.map((f) => f.rule);

describe('the happy path', () => {
  test('a well-formed draft passes all five gates', () => {
    const report = runGates(passingDraft, emptyContext);
    assert.equal(report.passed, true,
      `expected pass, got: ${JSON.stringify(report.results.flatMap((r) => r.failures), null, 2)}`);
  });

  test('meta description sits inside the 140-160 window', () => {
    const n = passingDraft.metaDescription.length;
    assert.ok(n >= 140 && n <= 160, `meta is ${n} chars`);
  });
});

describe('gate 1 — strategy', () => {
  test('rejects a keyword that is not in the sheet', () => {
    const r = strategyGate(draft({ primaryKeyword: 'best crm software' }));
    assert.ok(rules(r).includes('keyword.known'));
  });

  test('rejects an excluded keyword', () => {
    const r = strategyGate(draft({ primaryKeyword: 'helium recommendations' }));
    assert.ok(rules(r).includes('keyword.excluded'));
  });

  test('requires a disambiguating qualifier in the title', () => {
    const r = strategyGate(draft({ title: 'How to improve revenue per visitor' }));
    assert.ok(rules(r).includes('qualifier.title'));
  });

  test('accepts D2C as a qualifier', () => {
    const r = strategyGate(draft({
      title: 'How to improve revenue per visitor for D2C brands',
      h1: 'How to improve revenue per visitor for D2C brands',
    }));
    assert.ok(!rules(r).some((x) => x.startsWith('qualifier')));
  });

  test('rejects a competitor brand in the title', () => {
    const r = strategyGate(draft({ title: 'How to improve revenue per visitor on Shopify vs Nosto' }));
    assert.ok(rules(r).includes('competitor.title'));
  });

  test('allows GA4 — an approved contrast target, not a banned competitor', () => {
    const r = strategyGate(draft({
      title: 'How to improve revenue per visitor when GA4 shows a Shopify drop',
      h1: 'How to improve revenue per visitor when GA4 shows a Shopify drop',
    }));
    assert.ok(!rules(r).some((x) => x.startsWith('competitor')));
  });

  test('rejects a persona that does not belong to the cluster', () => {
    const r = strategyGate(draft({ personaId: 'merchandising-ops' }));
    assert.ok(rules(r).includes('persona.in_cluster'));
  });

  test('seasonal guard blocks shopper intent in the title', () => {
    const r = strategyGate(draft({
      clusterId: 'india-seasonal',
      personaId: 'growth-performance',
      primaryKeyword: 'How to reduce wasted catalog ad spend',
      title: 'Shopify sale dates 2026: when is the upcoming sale',
      h1: 'Shopify sale dates 2026: when is the upcoming sale',
    }));
    assert.ok(rules(r).includes('audience_guard.title'),
      'the d2c-apparel-calendar failure mode must be caught');
  });
});

describe('gate 2 — structure', () => {
  test('rejects a slug with a curly apostrophe', () => {
    const r = structureGate(draft({ slug: 'why-product-recommendations-don’t-convert' }));
    assert.ok(rules(r).includes('slug.ascii'));
  });

  test('rejects a slug with a period', () => {
    const r = structureGate(draft({ slug: 'real-time-vs.-segmentation' }));
    assert.ok(rules(r).includes('slug.ascii'));
  });

  test('rejects a percent-encoded slug', () => {
    const r = structureGate(draft({ slug: 'valentine%E2%80%99s-day-2026' }));
    assert.ok(rules(r).includes('slug.ascii'));
  });

  test('requires a TL;DR', () => {
    const r = structureGate(draft({ bodyMd: passingDraft.bodyMd.replace('**TL;DR:** ', '') }));
    assert.ok(rules(r).includes('structure.tldr'));
  });

  test('rejects a short meta description', () => {
    const r = structureGate(draft({ metaDescription: 'Too short.' }));
    assert.ok(rules(r).includes('meta.length'));
  });

  test('requires the primary keyword in the meta', () => {
    const r = structureGate(draft({
      metaDescription: 'A guide for Shopify stores that want more from the traffic they already pay for, with practical steps you can apply today.',
    }));
    assert.ok(rules(r).includes('keyword.meta'));
  });

  test('rejects two CTAs', () => {
    const r = structureGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nOr Book a demo — actually, Contact us instead.`,
    }));
    assert.ok(rules(r).includes('cta.single'));
  });

  test('rejects no CTA', () => {
    const r = structureGate(draft({
      bodyMd: passingDraft.bodyMd.replace(/Book a call.*/, 'That is the whole play.'),
    }));
    assert.ok(rules(r).includes('cta.present'));
  });

  test('rejects long-winded prose', () => {
    const long = 'This particular sentence has been constructed deliberately so that it runs well past the fifteen word ceiling that the brand voice document sets out for us. ';
    const r = structureGate(draft({ bodyMd: `**TL;DR:** short.\n\n## H\n\n${long.repeat(6)}\n\nBook a call.` }));
    assert.ok(rules(r).includes('sentence.length'));
  });
});

describe('gate 3 — provenance', () => {
  test('accepts a number that is in the ledger', () => {
    const r = provenanceGate(passingDraft);
    assert.ok(!rules(r).includes('claim.untraceable'), JSON.stringify(r.failures));
  });

  test('rejects an invented metric', () => {
    const r = provenanceGate(draft({
      bodyMd: passingDraft.bodyMd.replace('30% higher conversion', '73% higher conversion'),
    }));
    assert.ok(rules(r).includes('claim.untraceable'));
  });

  test('rejects blocked Shopify App pricing', () => {
    const r = provenanceGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nPlans start at $100/month.` }));
    assert.ok(rules(r).includes('claim.blocked'));
  });

  test('rejects blocked Ad Stack pricing', () => {
    const r = provenanceGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nKickstart is ₹2,000 a month.` }));
    assert.ok(rules(r).includes('claim.blocked'));
  });

  test('allows Agentcy pricing — unconflicted, so not blocked', () => {
    const r = provenanceGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nCreatives cost ₹20 per image.` }));
    assert.ok(!rules(r).includes('claim.blocked'), JSON.stringify(r.failures));
  });

  test('rejects a founder name while the title conflict is open', () => {
    const r = provenanceGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nShray Arora founded the company.` }));
    assert.ok(rules(r).includes('claim.blocked'));
  });

  test('rejects a real number attributed to the wrong brand', () => {
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nLenskart lifted revenue per visit 27% in 4 weeks.`,
    }));
    assert.ok(rules(r).includes('claim.misattributed'),
      'W for Woman\'s figure must not be movable onto Lenskart');
  });

  test('accepts the same number on its rightful owner', () => {
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nW for Woman lifted revenue per visit 27% in 4 weeks.`,
    }));
    assert.ok(!rules(r).includes('claim.misattributed'), JSON.stringify(r.failures));
  });

  test('rejects a confidential merchant name', () => {
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nTed Baker rebuilt their collection pages with us.`,
    }));
    assert.ok(rules(r).includes('customer.confidential'),
      'a merchant not on the approved public list must never reach a draft');
  });

  test('allows a merchant that is publicly named already', () => {
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nLenskart rebuilt their collection pages with us.`,
    }));
    assert.ok(!rules(r).includes('customer.confidential'), JSON.stringify(r.failures));
  });

  test('two customers in adjacent sentences do not cross-contaminate', () => {
    // Real GLM-5.2 output. Both attributions are correct; the first version of
    // this gate raised three failures on it.
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nW for Woman saw revenue per visit up 27% in 4 weeks. Sudathi saw a 25% conversion uplift.`,
    }));
    assert.ok(!rules(r).includes('claim.misattributed'), JSON.stringify(r.failures));
  });

  test('ignores a bare year', () => {
    const r = provenanceGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nThis changed in 2026.` }));
    assert.ok(!rules(r).includes('claim.untraceable'), JSON.stringify(r.failures));
  });
});

describe('gate 4 — cannibalization', () => {
  test('rejects a duplicate slug', () => {
    const r = cannibalizationGate(passingDraft, {
      existingSlugs: ['how-to-improve-revenue-per-visitor'], targetedKeywords: [],
    });
    assert.ok(rules(r).includes('slug.unique'));
  });

  test('rejects a keyword an existing post already owns', () => {
    const r = cannibalizationGate(passingDraft, {
      existingSlugs: [], targetedKeywords: ['how to improve revenue per visitor'],
    });
    assert.ok(rules(r).includes('keyword.untargeted'));
  });

  test('matching is case-insensitive', () => {
    const r = cannibalizationGate(passingDraft, {
      existingSlugs: ['HOW-TO-IMPROVE-REVENUE-PER-VISITOR'], targetedKeywords: [],
    });
    assert.ok(rules(r).includes('slug.unique'));
  });

  // Multi-target selection: the dashboard can ask one post to own several
  // keywords, and everything the lead is held to applies to the rest.
  test('an additional target is not foreign to its own post', () => {
    const r = cannibalizationGate(
      draft({
        additionalKeywords: ['How to personalise a Shopify store'],
        bodyMd: `${passingDraft.bodyMd}\n\nHow to personalise a Shopify store. `
          + 'How to personalise a Shopify store. How to personalise a Shopify store.',
      }),
      { existingSlugs: [], targetedKeywords: [] },
    );
    assert.ok(!rules(r).includes('keyword.foreign'), JSON.stringify(r.failures));
  });

  test('an additional target already owned by another post is rejected', () => {
    const r = cannibalizationGate(
      draft({ additionalKeywords: ['How to personalise a Shopify store'] }),
      { existingSlugs: [], targetedKeywords: ['how to personalise a shopify store'] },
    );
    assert.ok(rules(r).includes('keyword.untargeted'));
  });
});

describe('secondary keyword ceilings', () => {
  // Real numbers from a 2,187-word draft that the old flat ceiling of 16
  // rejected: five secondaries used four to six times each, which is 1.05 uses
  // per hundred words against a rate limit of two.
  const withSecondaries = (each: number, padWords: number) => {
    const terms = ['ugc ad examples', 'ugc video ads', 'ugc platforms', 'ai ugc', 'testimonial ads'];
    const uses = terms.flatMap((t) => Array.from({ length: each }, () => `We ran ${t} last quarter.`));
    const pad = Array.from({ length: padWords }, (_, i) => `word${i}`).join(' ');
    return draft({
      primaryKeyword: 'ugc ads',
      clusterId: 'marketing-efficiency',
      personaId: 'performance-marketing',
      bodyMd: `**TL;DR:** ugc ads.\n\n## ugc ads\n\n${uses.join(' ')}\n\n${pad}\n\nBook a call.`,
    });
  };

  test('a long post using many secondaries at a normal rate is not stuffing', () => {
    const r = structureGate(withSecondaries(5, 2000));
    assert.ok(!rules(r).includes('keyword.secondary_overused'), JSON.stringify(r.failures));
    assert.ok(!rules(r).includes('keyword.secondary_repeated'), JSON.stringify(r.failures));
  });

  test('the same count crammed into a short post is', () => {
    const r = structureGate(withSecondaries(5, 100));
    assert.ok(rules(r).includes('keyword.secondary_overused'), JSON.stringify(r.failures));
  });

  test('one secondary hammered is caught even when the total is fine', () => {
    const many = Array.from({ length: 14 }, () => 'Our ugc video ads shipped fast.').join(' ');
    const pad = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
    const r = structureGate(draft({
      primaryKeyword: 'ugc ads',
      clusterId: 'marketing-efficiency',
      personaId: 'performance-marketing',
      bodyMd: `**TL;DR:** ugc ads.\n\n## ugc ads\n\n${many}\n\n${pad}\n\nBook a call.`,
    }));
    assert.ok(!rules(r).includes('keyword.secondary_overused'), JSON.stringify(r.failures));
    assert.ok(rules(r).includes('keyword.secondary_repeated'), JSON.stringify(r.failures));
  });
});

describe('multi-target selection', () => {
  const two = {
    additionalKeywords: ['How to personalise a Shopify store'],
  };

  test('a second target needs its own H2', () => {
    const r = structureGate(draft(two));
    assert.ok(rules(r).includes('keyword.additional_unheaded'), JSON.stringify(r.failures));
  });

  test('a second target mentioned once is not covered', () => {
    const r = structureGate(draft({
      ...two,
      bodyMd: `${passingDraft.bodyMd}\n\n## How to personalise a Shopify store\n\nOne mention.`,
    }));
    assert.ok(rules(r).includes('keyword.additional_underused'), JSON.stringify(r.failures));
  });

  test('the length floor rises with each target', () => {
    const floorOf = (extra: string[]) => {
      const r = structureGate(draft({ additionalKeywords: extra }));
      const m = r.failures.find((f) => f.rule === 'length.floor')?.message ?? '';
      return Number(m.match(/the floor is (\d+)/)?.[1] ?? 0);
    };
    // 1,500 characters per additional target, matching CHARS_PER_ADDITIONAL_TARGET.
    assert.equal(floorOf(['a', 'b', 'c']) - floorOf(['a', 'b']), 1500);
  });

  test('targets from another cluster are rejected, not silently merged', () => {
    // "post purchase upsell" is aov-basket; the passing draft leads on a
    // conversion-rate keyword.
    const r = strategyGate(draft({ additionalKeywords: ['post purchase upsell'] }));
    assert.ok(rules(r).includes('cluster.targets_agree'), JSON.stringify(r.failures));
  });

  test('assembleBrief refuses a cross-cluster selection', async () => {
    const { assembleBrief, BriefError } = await import('../brief/assemble.js');
    assert.throws(
      () => assembleBrief({
        primaryKeyword: 'How to improve revenue per visitor',
        additionalKeywords: ['post purchase upsell'],
      }),
      BriefError,
    );
  });

  test('assembleBrief carries every selected target and its secondaries', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const brief = assembleBrief({
      primaryKeyword: 'How to improve revenue per visitor',
      additionalKeywords: ['How to personalise a Shopify store', 'How to improve revenue per visitor'],
    });
    // The duplicate of the lead is dropped, not double-counted.
    assert.equal(brief.additionalTargets.length, 1);
    assert.equal(brief.additionalTargets[0]!.keyword, 'How to personalise a Shopify store');
    assert.ok(brief.budget.secondariesCombined[1] > 5);
  });

  test('the prompt states every target it will be gated on', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { renderSystemPrompt } = await import('../brief/render.js');
    const prompt = renderSystemPrompt(assembleBrief({
      primaryKeyword: 'How to improve revenue per visitor',
      additionalKeywords: ['How to personalise a Shopify store'],
    }));
    assert.ok(prompt.includes('How to personalise a Shopify store'));
    assert.match(prompt, /section of their own/);
  });
});

describe('gate 5 — tone floor', () => {
  test('fails a hedge', () => {
    const r = toneFloorGate(draft({
      bodyMd: passingDraft.bodyMd.replace('merchants see', 'merchants could help see'),
    }));
    assert.ok(rules(r).includes('tone.hedging'));
  });

  test('fails "may improve"', () => {
    const r = toneFloorGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nThis may improve things.` }));
    assert.ok(rules(r).includes('tone.hedging'));
  });

  test('fails a hard superlative', () => {
    const r = toneFloorGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nResults are guaranteed.` }));
    assert.ok(rules(r).includes('tone.hard_superlative'));
  });

  test('allows loud framing that is not a claim about the world', () => {
    const r = toneFloorGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nThe lift is dramatic and it lands fast.`,
    }));
    assert.equal(r.passed, true, JSON.stringify(r.failures));
  });

  test('fails banned marketing filler', () => {
    const r = toneFloorGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\nA seamless experience.` }));
    assert.ok(rules(r).includes('tone.banned_phrase'));
  });

  test('requires a coined term', () => {
    const r = toneFloorGate(draft({
      bodyMd: passingDraft.bodyMd.replace(/[Ss]ession-aware merchandising/g, 'smart sorting'),
    }));
    assert.ok(rules(r).includes('tone.coined_term'));
  });

  test('requires the coined term to be defined', () => {
    const r = toneFloorGate(draft({
      bodyMd: passingDraft.bodyMd.replace(
        'Session-aware merchandising is reordering products from live behaviour,\nnot from a segment decided last quarter.',
        'Session-aware merchandising helps a lot.',
      ),
    }));
    assert.ok(rules(r).includes('tone.coined_term_undefined'));
  });

  test('fails an opening question', () => {
    const r = toneFloorGate(draft({
      bodyMd: `**TL;DR:** Why does revenue per visitor stall?\n\n## H\n\nBook a call.`,
    }));
    assert.ok(rules(r).includes('tone.opens_on_question'));
  });
});

describe('primitives', () => {
  test('extracts result-shaped numerals and skips prose numbers', () => {
    const found = extractNumerals('We saw 30% growth, 5× ROAS, ₹45 crore, 100+ brands in 2026 across three regions.');
    const raw = found.map((n) => n.normalized);
    assert.deepEqual(raw.sort(), ['100', '30', '45', '5'].sort());
  });

  test('normalises thousands separators', () => {
    assert.deepEqual(extractNumerals('2,300+ brands').map((n) => n.normalized), ['2300']);
  });

  test('expands large ledger numbers to their prose forms', () => {
    assert.ok(ledgerForms(['1140000']).has('1.14'));
  });

  test('phrase matching respects word boundaries', () => {
    assert.equal(containsPhrase('a seamless experience', 'seamless'), true);
    assert.equal(containsPhrase('seamlessly integrated', 'seamless'), false);
  });

  test('markdown is stripped before matching', () => {
    assert.equal(bodyProse('## Heading\n\n**bold** and [a link](https://x.com)').includes('#'), false);
  });

  test('finds H2s only', () => {
    assert.deepEqual(headings('# One\n## Two\n### Three', 2), ['Two']);
  });

  test('splits sentences on terminal punctuation', () => {
    assert.equal(sentences('One. Two! Three?').length, 3);
  });
});

describe('numeral shapes', () => {
  test('a plus-count is not the same figure as a percentage', async () => {
    const { extractNumerals } = await import('./numerals.js');
    const [plus] = extractNumerals('reads 40+ site-level signals');
    const [pct] = extractNumerals('CVR up to ~40%');
    assert.equal(plus?.normalized, pct?.normalized, 'same digits');
    assert.notEqual(plus?.shape, pct?.shape, 'different quantities');
  });

  test('a platform mechanism claim is not attributed to a customer', () => {
    // Real GLM-5.2 output: "40+" appeared in a sentence naming Akiso, and the
    // digits collided with Lifelong's 40% conversion lift.
    const r = provenanceGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nAkiso runs on the same engine, which reads 40+ site-level signals.`,
    }));
    assert.ok(!rules(r).includes('claim.misattributed'), JSON.stringify(r.failures));
  });
});

describe('dashes and cadence', () => {
  test('an em dash fails the draft', () => {
    const r = toneFloorGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nThe grid reorders itself — every session.`,
    }));
    assert.ok(rules(r).includes('tone.em_dash'), JSON.stringify(r.failures));
  });

  test('an en dash and a double hyphen fail too', () => {
    for (const body of ['A lift of 20–30 percent.', 'The grid reorders--every session.']) {
      const r = toneFloorGate(draft({ bodyMd: `${passingDraft.bodyMd}\n\n${body}` }));
      assert.ok(rules(r).includes('tone.em_dash'), body);
    }
  });

  test('a dash in the title or meta is caught, not just the body', () => {
    const r = toneFloorGate(draft({ title: 'Revenue per visitor — the Shopify guide' }));
    assert.ok(rules(r).includes('tone.em_dash'));
  });

  test('a hyphenated word is not a dash', () => {
    const r = toneFloorGate(draft({
      bodyMd: `${passingDraft.bodyMd}\n\nA well-built session-aware storefront.`,
    }));
    assert.ok(!rules(r).includes('tone.em_dash'), JSON.stringify(r.failures));
  });

  // Built from scratch rather than appended to the fixture: the fixture already
  // breaks form twelve times on its own, which is the brand voice agreeing with
  // this rule but makes it useless as a negative case.
  const flat = (n: number) => Array.from({ length: n }, (_, i) =>
    `The storefront reorders its product grid for the shopper in position ${i} today.`).join(' ');
  const body = (tail: string) =>
    `**TL;DR:** Revenue per visit rises when the grid reorders itself.\n\n`
    + `## The mechanism\n\n`
    + `Session-aware merchandising is reordering products from live behaviour.\n\n`
    + `${tail}\n\nBook a call.`;

  test('prose that never breaks form is rejected', () => {
    const r = toneFloorGate(draft({ bodyMd: body(flat(18)) }));
    assert.ok(rules(r).includes('tone.too_polished'), JSON.stringify(r.failures));
  });

  test('conjunction openers, fragments, ellipses and asides all count as breaks', () => {
    const broken = `${flat(18)} And it works. Every time. Not the ad... `
      + `(the fold, actually) is where the money was sitting. `
      + `But the grid had to move first. So it did. Which is the whole point.`;
    const r = toneFloorGate(draft({ bodyMd: body(broken) }));
    assert.ok(!rules(r).includes('tone.too_polished'), JSON.stringify(r.failures));
  });

  test('a short post is not required to break form', () => {
    const r = toneFloorGate(passingDraft);
    assert.ok(!rules(r).includes('tone.too_polished'), JSON.stringify(r.failures));
  });

  test('the prompt contains no dash it tells the writer not to use', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { renderSystemPrompt } = await import('../brief/render.js');
    const { serpCoverageFor } = await import('../brief/serp.js');
    for (const kw of ['post purchase upsell', 'ugc ads', 'ecommerce analytics software']) {
      // Populated exactly as the pipeline populates it. The earlier version of
      // this test left serpCoverage empty, so the whole section was omitted and
      // eight dashes from scraped competitor headings went unnoticed.
      const prompt = renderSystemPrompt(assembleBrief({
        primaryKeyword: kw,
        serpCoverage: serpCoverageFor(kw),
        existingTitles: ['A live post — with a dash in its title'],
      }));
      const found = prompt.match(/[—–]/g);
      assert.equal(found, null, `prompt for "${kw}" contains ${found?.length} dash(es)`);
    }
  });

  test('scraped competitor headings are stripped, not passed through', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { renderSystemPrompt } = await import('../brief/render.js');
    const prompt = renderSystemPrompt(assembleBrief({
      primaryKeyword: 'post purchase upsell',
      serpCoverage: [{ url: 'https://example.com', headings: ['ReConvert — Best for Post-Purchase'] }],
    }));
    assert.ok(prompt.includes('ReConvert, Best for Post-Purchase'), 'heading should survive, dash should not');
  });
});

describe('coined-term definitions', () => {
  const define = (clause: string) => draft({
    bodyMd: passingDraft.bodyMd.replace(
      'Session-aware merchandising is reordering products from live behaviour,\nnot from a segment decided last quarter.',
      clause,
    ),
  });

  test('accepts a tight comma appositive', () => {
    // This used to be written with em dashes, which is how GLM-5.2 produced it
    // and how brand-voice.md wrote it. Dashes are banned now, so the appositive
    // carries a comma and the gate has to accept that instead.
    const r = toneFloorGate(define('Session-aware merchandising, reordering products from live behaviour, lifts revenue.'));
    assert.ok(!rules(r).includes('tone.coined_term_undefined'), JSON.stringify(r.failures));
  });

  test('a bare comma is not a definition', () => {
    const r = toneFloorGate(define('Session-aware merchandising, which we like, is worth having.'
      .replace('which we like, is worth having', 'and other things, matter here')));
    assert.ok(rules(r).includes('tone.coined_term_undefined'), JSON.stringify(r.failures));
  });

  test('accepts a colon definition', () => {
    const r = toneFloorGate(define('Session-aware merchandising: reordering products from live behaviour.'));
    assert.ok(!rules(r).includes('tone.coined_term_undefined'));
  });

  test('still rejects a term used with no definition at all', () => {
    const r = toneFloorGate(define('Session-aware merchandising helps a lot and we like it.'));
    assert.ok(rules(r).includes('tone.coined_term_undefined'));
  });
});

describe('overlapping keyword counting', () => {
  test('a nested secondary is not billed twice', async () => {
    const { countNonOverlapping } = await import('./text.js');
    const text = 'revenue per visitor rose. revenue per visitor rose again.';
    const primary = countNonOverlapping(text, ['revenue per visitor']);
    assert.equal(primary.total, 2);
    const secondary = countNonOverlapping(text, ['revenue per visit'], primary.spans);
    assert.equal(secondary.total, 0, '"revenue per visit" is inside "revenue per visitor"');
  });

  test('a genuinely separate use of the shorter term still counts', async () => {
    const { countNonOverlapping } = await import('./text.js');
    const text = 'revenue per visitor rose. revenue per visit is the metric.';
    const primary = countNonOverlapping(text, ['revenue per visitor']);
    const secondary = countNonOverlapping(text, ['revenue per visit'], primary.spans);
    assert.equal(secondary.total, 1);
  });
});
