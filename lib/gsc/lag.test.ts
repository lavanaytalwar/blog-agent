import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LAG_DAYS, reportedThrough, windowHasClosed } from './lag.js';

const NOW = new Date('2026-08-27T09:00:00Z');
const at = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

describe('Search Console reporting lag', () => {
  test('reported-through is the lag behind the given day', () => {
    assert.equal(reportedThrough(NOW), at(LAG_DAYS));
  });

  test('a window ending today is held', () => {
    assert.equal(windowHasClosed(at(0), NOW), false);
  });

  test('a window inside the lag is held, even though the day has passed', () => {
    // This is the case the old `end > new Date()` check let through, and it is
    // the one that matters: on a +7 window these two days are a third of the
    // reading.
    assert.equal(windowHasClosed(at(1), NOW), false);
    assert.equal(windowHasClosed(at(2), NOW), false);
  });

  test('a window ending exactly at the lag boundary is readable', () => {
    assert.equal(windowHasClosed(at(LAG_DAYS), NOW), true);
  });

  test('older windows are readable', () => {
    assert.equal(windowHasClosed(at(30), NOW), true);
  });

  test('future windows are held', () => {
    assert.equal(windowHasClosed(at(-14), NOW), false);
  });
});
