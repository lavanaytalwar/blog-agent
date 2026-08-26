import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lessonFrom, type PageAnalysis } from './analyze.js';

const page = (over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  url: 'https://example.com/blog/x', host: 'example.com', kind: 'article',
  title: 'A guide', words: 1500, h2s: ['One', 'Two', 'Three'], updated: '2026-06-01',
  ageDays: 86, schema: ['Article'], lists: 3, tables: 0, questions: 0, images: 4,
  outbound: 6, introWords: 90, hasAuthor: true, isNumberedList: false, ...over,
});

describe('SERP lesson', () => {
  test('store listings and thin pages are excluded, and said to be excluded', () => {
    const l = lessonFrom([
      page(), page({ words: 2000 }),
      page({ kind: 'product', url: 'https://apps.shopify.com/a' }),
      page({ kind: 'other', words: 3, url: 'https://x.io/' }),
    ]);
    assert.equal(l.analysed, 2);
    assert.equal(l.skipped.length, 2);
    assert.ok(l.observations.some((o) => o.includes('not written pages')));
  });

  test('the median is over written pages only, so a listing cannot drag it', () => {
    const l = lessonFrom([
      page({ words: 2000 }), page({ words: 1800 }), page({ words: 1900 }),
      page({ kind: 'product', words: 50 }),
    ]);
    assert.equal(l.medianWords, 1900);
  });

  test('a roundup-dominated SERP is called out as one', () => {
    const l = lessonFrom([
      page({ isNumberedList: true, title: '10 Best tools' }),
      page({ kind: 'listing' }),
      page(),
    ]);
    assert.ok(l.observations.some((o) => o.includes('numbered roundups') && o.includes('depth per item')));
  });

  test('a SERP of original pieces invites a single-argument post', () => {
    const l = lessonFrom([page(), page(), page()]);
    assert.ok(l.observations.some((o) => o.includes('single-argument piece competes')));
  });

  test('freshness is reported either way, never left silent', () => {
    const stale = lessonFrom([page({ updated: '2019-01-01', ageDays: 2800 })]);
    assert.ok(stale.observations.some((o) => o.includes('substance rather than recency')));
    const fresh = lessonFrom([page({ ageDays: 30 })]);
    assert.ok(fresh.observations.some((o) => o.includes('freshness is being rewarded')));
  });

  test('an empty SERP produces no observations rather than invented ones', () => {
    const l = lessonFrom([]);
    assert.equal(l.analysed, 0);
    assert.deepEqual(l.observations, []);
  });

  test('one written page reads as singular', () => {
    const l = lessonFrom([page(), page({ kind: 'product' })]);
    assert.ok(l.observations.some((o) => o.includes('1 written page runs')), JSON.stringify(l.observations));
  });
});

describe('word target', () => {
  test('tracks the measured median when one exists', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const brief = assembleBrief({ primaryKeyword: 'ugc ads' });
    // config/serp-analysis.json carries a real measurement for this keyword.
    if (brief.serpLesson) {
      assert.equal(brief.wordTarget[0], Math.min(brief.serpLesson.lesson.medianWords, 2400));
      assert.ok(brief.wordTarget[1] > brief.wordTarget[0]);
    }
  });

  test('falls back to the default when nothing has been measured', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const brief = assembleBrief({ primaryKeyword: 'How to improve product discovery' });
    if (!brief.serpLesson) assert.deepEqual(brief.wordTarget, [700, 1200]);
  });

  test('the prompt states the target and never a bare default', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { renderSystemPrompt } = await import('../brief/render.js');
    const brief = assembleBrief({ primaryKeyword: 'ugc ads' });
    const prompt = renderSystemPrompt(brief);
    assert.ok(prompt.includes(`${brief.wordTarget[0]} to ${brief.wordTarget[1]} words`));
  });
});
