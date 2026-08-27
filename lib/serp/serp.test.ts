import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lessonFrom, type PageAnalysis } from './analyze.js';
import { organicFrom, SearchError } from './search.js';

const page = (over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  url: 'https://example.com/blog/x', host: 'example.com', kind: 'article',
  title: 'A guide', words: 1500, chars: 9000, h2s: ['One', 'Two', 'Three'], updated: '2026-06-01',
  ageDays: 86, schema: ['Article'], lists: 3, tables: 0, questions: 0, images: 4,
  outbound: 6, introWords: 90, hasAuthor: true, isNumberedList: false, ...over,
});

describe('SERP lesson', () => {
  test('store listings and thin pages are excluded, and said to be excluded', () => {
    const l = lessonFrom([
      page(), page({ words: 2000, chars: 12000 }),
      page({ kind: 'product', url: 'https://apps.shopify.com/a' }),
      page({ kind: 'other', words: 3, chars: 18, url: 'https://x.io/' }),
    ]);
    assert.equal(l.analysed, 2);
    assert.equal(l.skipped.length, 2);
    assert.ok(l.observations.some((o) => o.includes('not written pages')));
  });

  test('the median is over written pages only, so a listing cannot drag it', () => {
    const l = lessonFrom([
      page({ words: 2000, chars: 12000 }), page({ words: 1800, chars: 10800 }), page({ words: 1900, chars: 11400 }),
      page({ kind: 'product', words: 50, chars: 300 }),
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

  test('a page too thin to have been read is excluded and reported', () => {
    // 21 words behind a consent wall is a failed fetch, not a short article.
    const l = lessonFrom([page(), page({ words: 21, chars: 130, kind: 'unreadable' })]);
    assert.equal(l.analysed, 1);
    assert.ok(l.observations.some((o) => o.includes('could not be read')), JSON.stringify(l.observations));
    // And it must not be reported as the SERP being non-editorial.
    assert.ok(!l.observations.some((o) => o.includes('not purely editorial')));
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
  test('every cached reading yields a target consistent with its own sample', async () => {
    const { assembleBrief, wordTargetFor } = await import('../brief/assemble.js');
    const { loadConfig } = await import('../config/load.js');
    // Over every real keyword rather than one hand-picked example. Two earlier
    // versions of this test named a specific keyword as its control and went
    // stale the moment that keyword's SERP was re-read.
    for (const k of loadConfig().keywords.keywords) {
      if (k.status === 'excluded' || !k.cluster_id) continue;
      const brief = assembleBrief({ primaryKeyword: k.keyword });
      const lesson = brief.serpLesson?.lesson;
      assert.deepEqual(
        brief.wordTarget,
        wordTargetFor(lesson?.medianWords, 0, lesson?.analysed ?? 0),
        `${k.keyword} target disagrees with its own reading`,
      );
      assert.ok(brief.wordTarget[1] >= brief.wordTarget[0], k.keyword);
      assert.ok(brief.wordTarget[1] <= 2400, `${k.keyword} exceeds the cap`);
    }
  });

  test('falls back to the default when nothing has been measured', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const brief = assembleBrief({ primaryKeyword: 'How to improve product discovery' });
    if (!brief.serpLesson) assert.deepEqual(brief.wordTarget, [700, 1200]);
  });

  test('the prompt states exactly the bounds the gate will enforce', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { renderSystemPrompt } = await import('../brief/render.js');
    const brief = assembleBrief({ primaryKeyword: 'ugc ads' });
    const prompt = renderSystemPrompt(brief);
    // The whole point of carrying the bounds on the brief: the number the writer
    // is given and the number gate 2 checks cannot drift apart.
    assert.ok(prompt.includes(String(brief.lengthFloor)), 'floor missing from prompt');
  });

  test('the enforced floor is flat, whether or not a SERP reading exists', async () => {
    const { assembleBrief } = await import('../brief/assemble.js');
    const { MIN_CHARS } = await import('../gates/structure.js');
    // "ugc ads" has a measured reading; "How to improve product discovery" has
    // none. The gate must not be able to tell them apart.
    const measured = assembleBrief({ primaryKeyword: 'ugc ads' });
    const unmeasured = assembleBrief({ primaryKeyword: 'How to improve product discovery' });
    assert.ok(measured.serpLesson, 'fixture expects a reading for this keyword');
    assert.equal(measured.lengthFloor, MIN_CHARS);
    assert.equal(unmeasured.lengthFloor, MIN_CHARS);
  });

  test('the SERP moves the advisory target, but only with a real sample', async () => {
    const { wordTargetFor } = await import('../brief/assemble.js');
    // Tested as a pure function rather than through whichever keywords happen
    // to be in the cache, which made this assertion go stale the moment a
    // reading was taken for the keyword it used as its control.
    assert.deepEqual(wordTargetFor(1800, 0, 4), [1800, 2340]);
    assert.deepEqual(wordTargetFor(1800, 0, 2), [700, 1200], 'two pages is not a median');
    assert.deepEqual(wordTargetFor(1800, 0, 0), [700, 1200]);
    assert.deepEqual(wordTargetFor(undefined, 0, 5), [700, 1200]);
  });

  test('the target is capped however long the SERP runs', async () => {
    const { wordTargetFor } = await import('../brief/assemble.js');
    const [lo, hi] = wordTargetFor(9000, 0, 5);
    assert.equal(lo, 2400);
    assert.equal(hi, 2400);
  });

  test('no gate imports from the SERP layer', async () => {
    // The independence is structural rather than a convention. A gate that
    // cannot reach lib/serp cannot come to depend on it again by accident.
    const { readdirSync, readFileSync } = await import('node:fs');
    const offenders: string[] = [];
    for (const file of readdirSync('lib/gates')) {
      if (!file.endsWith('.ts')) continue;
      if (/from '\.\.\/serp\//.test(readFileSync(`lib/gates/${file}`, 'utf8'))) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, [], `lib/gates must not import from lib/serp: ${offenders.join(', ')}`);
  });
});


describe('Apify result parsing', () => {
  // One dataset row per result page, organic results nested. Tested without a
  // live account because this is the only part of the provider that is not a
  // plain fetch, and the part that breaks if the actor changes its output.
  const row = (urls: string[]) => [{
    searchQuery: { term: 'ugc ads' },
    organicResults: urls.map((url, i) => ({ url, title: `Result ${i}`, position: i + 1 })),
  }];

  test('flattens organic results and ranks them', () => {
    const hits = organicFrom(row(['https://a.com', 'https://b.com']), 6);
    assert.deepEqual(hits.map((h) => h.rank), [1, 2]);
    assert.equal(hits[0]!.url, 'https://a.com');
  });

  test('takes only the requested count', () => {
    const hits = organicFrom(row(Array.from({ length: 10 }, (_, i) => `https://x${i}.com`)), 6);
    assert.equal(hits.length, 6);
  });

  test('rows without organic results are skipped, not counted as hits', () => {
    const hits = organicFrom([{ paidResults: [] }, ...row(['https://a.com'])], 6);
    assert.equal(hits.length, 1);
  });

  test('an empty run is an error, not silently zero results', () => {
    // Silence here would produce a brief with no SERP lesson and no explanation,
    // which is the one outcome worse than failing.
    assert.throws(() => organicFrom([], 6), SearchError);
    assert.throws(() => organicFrom({ error: 'actor failed' }, 6), SearchError);
  });

  test('a malformed entry does not take the whole run down', () => {
    const hits = organicFrom([{ organicResults: [{ title: 'no url' }, { url: 'https://a.com' }] }], 6);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.url, 'https://a.com');
  });
});
