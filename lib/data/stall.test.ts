import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generationState, humanDuration, STALL_AFTER_MS } from './stall.js';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const row = (over: Partial<Parameters<typeof generationState>[0]> = {}) => ({
  status: 'drafted',
  body_md: null,
  created_at: ago(60_000),
  generation_started_at: ago(60_000),
  ...over,
});

describe('generationState', () => {
  test('a fresh drafted row is running, not dead', () => {
    const state = generationState(row(), NOW);
    assert.equal(state.state, 'running');
    assert.equal(state.elapsedMs, 60_000);
  });

  test('past the threshold it is stalled', () => {
    const state = generationState(row({ generation_started_at: ago(STALL_AFTER_MS + 1000) }), NOW);
    assert.equal(state.state, 'stalled');
  });

  test('exactly at the threshold it is stalled, not running', () => {
    // The boundary is the whole point of the check; leaving it ambiguous is how
    // a post sits at 14 minutes 59 seconds forever.
    assert.equal(generationState(row({ generation_started_at: ago(STALL_AFTER_MS) }), NOW).state,
      'stalled');
  });

  test('a written draft is idle however old', () => {
    const state = generationState(
      row({ body_md: '**TL;DR:** done.', generation_started_at: ago(STALL_AFTER_MS * 10) }),
      NOW,
    );
    assert.equal(state.state, 'idle');
  });

  test('a decided post is idle even with no body', () => {
    for (const status of ['awaiting_approval', 'failed_gates', 'approved', 'discarded']) {
      assert.equal(generationState(row({ status }), NOW).state, 'idle', status);
    }
  });

  test('a row that never recorded a start falls back to created_at', () => {
    // This is the run that died before its first statement, not a run that is
    // idle. It must still be reportable.
    const state = generationState(
      row({ generation_started_at: null, created_at: ago(STALL_AFTER_MS + 1000) }),
      NOW,
    );
    assert.equal(state.state, 'stalled');
  });

  test('a regenerate is judged on its own start, not the original insert', () => {
    // The row is a day old; the attempt is a minute old. Judging by created_at
    // would call a healthy regenerate dead on arrival.
    const state = generationState(
      row({ created_at: ago(86_400_000), generation_started_at: ago(60_000) }),
      NOW,
    );
    assert.equal(state.state, 'running');
  });

  test('a clock skewed into the future does not report negative elapsed time', () => {
    const state = generationState(row({ generation_started_at: ago(-5000) }), NOW);
    assert.equal(state.state, 'running');
    assert.equal(state.elapsedMs, 0);
  });
});

describe('humanDuration', () => {
  test('reads as a glance, not a stopwatch', () => {
    assert.equal(humanDuration(30_000), 'less than a minute');
    assert.equal(humanDuration(60_000), '1 min');
    assert.equal(humanDuration(7 * 60_000), '7 min');
    assert.equal(humanDuration(60 * 60_000), '1 h');
    assert.equal(humanDuration(72 * 60_000), '1 h 12 min');
  });
});
