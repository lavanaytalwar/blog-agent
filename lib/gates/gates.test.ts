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
    const r = structureGate(draft({ bodyMd: passingDraft.bodyMd.replace('**TL;DR** — ', '') }));
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
    const r = structureGate(draft({ bodyMd: `**TL;DR** — short.\n\n## H\n\n${long.repeat(6)}\n\nBook a call.` }));
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
      bodyMd: `**TL;DR** — Why does revenue per visitor stall?\n\n## H\n\nBook a call.`,
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
