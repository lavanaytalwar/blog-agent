import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inStrikingBand, thresholds } from './mine.js';

describe('striking-distance band', () => {
  const at = (impressions: number, position: number) => ({ impressions, position });

  test('a page-two query with real demand qualifies', () => {
    assert.ok(inStrikingBand(at(40, 14)));
  });

  test('too little demand to be worth winning', () => {
    assert.equal(inStrikingBand(at(9, 14)), false);
  });

  test('a head term is out, however good the position looks', () => {
    // The ceiling is the niche test. At 400 impressions the competition is
    // established publishers and position 14 means outgunned, not one revision
    // away — and the target is rank 1, not page one.
    assert.equal(inStrikingBand(at(400, 14)), false);
  });

  test('the band is inclusive at both ends', () => {
    assert.ok(inStrikingBand(at(thresholds.STRIKING.minImpressions, 11)));
    assert.ok(inStrikingBand(at(thresholds.STRIKING.maxImpressions, 20)));
  });

  test('already winning is not striking distance', () => {
    assert.equal(inStrikingBand(at(50, 4)), false);
  });

  test('too far back for a rewrite to close the gap', () => {
    assert.equal(inStrikingBand(at(50, 47)), false);
  });
});
