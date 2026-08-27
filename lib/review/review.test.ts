import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { CHECKS, CHECK_IDS, MIN_REPORTED, promptChecks } from './checks.js';
import { renderReviewPrompt, renderReviewMessage } from './prompt.js';
import { parseReview, ReviewParseError } from './run.js';
import { weaknesses } from './types.js';
import { assembleBrief } from '../brief/assemble.js';
import { renderSystemPrompt } from '../brief/render.js';
import { RULES } from '../gates/rules.js';

const KEYWORD = 'ecommerce personalization / personalization for ecommerce';
const brief = () => assembleBrief({ primaryKeyword: KEYWORD });

const BODY = [
  '**TL;DR:** Revenue per visit moves when the grid moves.',
  'Akiso watched traffic climb for six weeks while revenue sat flat.',
  'Session velocity is the rate a shopper narrows their own intent.',
  'The store read the session and reordered the collection.',
  'Book a call and we will show you the fold nobody scrolls past.',
].join('\n\n');

const okNote = (check: string) => ({ check, verdict: 'ok', note: 'Holds up.' });

/** Enough passing notes to clear the reporting floor, plus whatever is on trial. */
const withFloor = (...notes: object[]) => JSON.stringify({
  notes: [...notes, ...CHECK_IDS.slice(-MIN_REPORTED).map((id) => okNote(id))],
});

describe('the check table', () => {
  test('is defined by subtraction from the gate rules', () => {
    // A check that duplicates a mechanical rule recreates the drift rules.ts
    // exists to stop, in a place where nothing fails to catch it.
    const overlap = CHECK_IDS.filter((id) => id in RULES);
    assert.deepEqual(overlap, [], `these are already gates: ${overlap.join(', ')}`);
  });

  test('contains no dash the writer is banned from typing', () => {
    // The same rule the gate prompt is held to. A model shown forty dashes
    // writes them.
    for (const [id, text] of Object.entries(CHECKS)) {
      assert.doesNotMatch(text, /[—–]|(?<=\S)--(?=\S)/, `${id} contains a dash`);
    }
  });
});

describe('prompt and table cannot diverge', () => {
  test('the writer is told every check it will be read for', () => {
    const prompt = renderSystemPrompt(brief());
    for (const id of CHECK_IDS) {
      assert.ok(prompt.includes(id), `writer prompt never mentions ${id}`);
    }
  });

  test('the reviewer is asked about exactly those checks', () => {
    const prompt = renderReviewPrompt(brief());
    for (const id of CHECK_IDS) {
      assert.ok(prompt.includes(id), `reviewer prompt never mentions ${id}`);
    }
    assert.ok(prompt.includes(promptChecks()), 'reviewer prompt must render from the table');
  });

  test('the reviewer is never shown the mechanical rules', () => {
    // It cannot re-litigate mechanics it has not seen, which is the reason the
    // mechanics stay in code.
    const prompt = renderReviewPrompt(brief());
    const leaked = Object.keys(RULES).filter((id) => prompt.includes(id));
    assert.deepEqual(leaked, [], `reviewer prompt leaks gate rules: ${leaked.join(', ')}`);
  });

  test('the draft body reaches the reviewer', () => {
    const message = renderReviewMessage({
      slug: 's', title: 'T', h1: 'H', metaDescription: 'M',
      bodyMd: BODY, primaryKeyword: KEYWORD, additionalKeywords: [],
      clusterId: null, personaId: null,
    });
    assert.ok(message.includes('Session velocity'));
  });
});

describe('the review cannot become a gate', () => {
  test('no gate imports from the review layer', () => {
    // Structural, not a convention. A gate that cannot reach lib/review cannot
    // come to depend on a model's judgment by accident.
    const offenders: string[] = [];
    for (const file of readdirSync('lib/gates')) {
      if (!file.endsWith('.ts')) continue;
      if (/from '\.\.\/review\//.test(readFileSync(`lib/gates/${file}`, 'utf8'))) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], `lib/gates must not import from lib/review: ${offenders.join(', ')}`);
  });

  test('weaknesses of an unavailable review is empty, never a failure', () => {
    assert.deepEqual(weaknesses({ status: 'unavailable', model: null, reason: 'timeout' }), []);
    assert.deepEqual(weaknesses(null), []);
  });
});

describe('parsing a review', () => {
  test('keeps a passing verdict with no quote', () => {
    const notes = parseReview(withFloor(), BODY);
    assert.equal(notes.length, MIN_REPORTED);
    assert.ok(notes.every((n) => n.verdict === 'ok'));
  });

  test('drops criticism with no quote', () => {
    const notes = parseReview(
      withFloor({ check: 'story.thread', verdict: 'weak', note: 'No thread.' }),
      BODY,
    );
    assert.ok(!notes.some((n) => n.check === 'story.thread'));
  });

  test('drops criticism quoting a sentence that is not in the draft', () => {
    // The one hallucination that would otherwise read as the most credible
    // finding on the panel.
    const notes = parseReview(
      withFloor({
        check: 'story.scene', verdict: 'missing', note: 'Opens on a definition.',
        quote: 'In the competitive world of ecommerce, personalization matters.',
      }),
      BODY,
    );
    assert.ok(!notes.some((n) => n.check === 'story.scene'));
  });

  test('keeps criticism quoting the draft, through case and whitespace', () => {
    const notes = parseReview(
      withFloor({
        check: 'story.scene', verdict: 'weak', note: 'The scene is thin.',
        quote: 'Akiso watched traffic climb   for six weeks',
      }),
      BODY,
    );
    const note = notes.find((n) => n.check === 'story.scene');
    assert.equal(note?.verdict, 'weak');
    assert.ok(note?.quote);
  });

  test('ignores unknown checks and repeats of one it already has', () => {
    const notes = parseReview(
      withFloor(
        { check: 'seo.vibes', verdict: 'weak', note: 'Invented check.', quote: BODY.slice(0, 40) },
        okNote('story.thread'),
        { check: 'story.thread', verdict: 'missing', note: 'Second bite.', quote: BODY.slice(0, 40) },
      ),
      BODY,
    );
    assert.equal(notes.filter((n) => n.check === 'story.thread').length, 1);
    assert.equal(notes.find((n) => n.check === 'story.thread')?.verdict, 'ok');
    assert.ok(!notes.some((n) => String(n.check) === 'seo.vibes'));
  });

  test('reads through a fence and a preamble', () => {
    const text = `Here is the review:\n\n\`\`\`json\n${withFloor()}\n\`\`\``;
    assert.equal(parseReview(text, BODY).length, MIN_REPORTED);
  });

  test('refuses a review too thin to be one', () => {
    const thin = JSON.stringify({ notes: [okNote('story.thread'), okNote('cta.earned')] });
    assert.throws(() => parseReview(thin, BODY), ReviewParseError);
  });

  test('refuses output that is not JSON at all', () => {
    assert.throws(() => parseReview('The post reads well overall.', BODY), ReviewParseError);
  });
});
