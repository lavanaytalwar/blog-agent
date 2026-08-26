import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, sameTarget, isVariantOf, tokens } from './fingerprint.js';

describe('keyword fingerprints', () => {
  test('word order does not create a second target', () => {
    assert.ok(sameTarget('ecommerce personalization', 'personalization for ecommerce'),
      'the sheet carries both forms inside one entry');
  });

  test('british and american spelling fold together', () => {
    assert.ok(sameTarget('ecommerce personalisation', 'ecommerce personalization'));
  });

  test('hyphenation folds', () => {
    assert.ok(sameTarget('e-commerce personalization', 'ecommerce personalization'));
  });

  test('plurals fold', () => {
    assert.ok(sameTarget('ecommerce personalization platforms', 'ecommerce personalization platform'));
  });

  test('a different qualifier is a different target', () => {
    assert.equal(sameTarget('ecommerce personalization platform', 'ecommerce personalization tool'), false);
  });

  test('stopwords are dropped', () => {
    assert.deepEqual(tokens('how to improve the revenue per visitor'),
      ['how', 'improve', 'revenue', 'per', 'visitor']);
  });

  test('repeated words collapse', () => {
    assert.equal(fingerprint('ecommerce personalization tool personalization'),
      fingerprint('ecommerce personalization tool'));
  });
});

describe('variant detection — what may become a secondary', () => {
  test('a qualified form is a variant of its primary', () => {
    assert.ok(isVariantOf('ecommerce personalization platform', 'ecommerce personalization'));
  });

  test('an identical target is not its own variant', () => {
    assert.equal(isVariantOf('personalization for ecommerce', 'ecommerce personalization'), false,
      'that is the same primary written differently, not a secondary');
  });

  test('an unrelated query is not a variant', () => {
    assert.equal(isVariantOf('post purchase upsell', 'ecommerce personalization'), false);
  });

  test('sharing under 60% of the primary tokens is not enough', () => {
    assert.equal(isVariantOf('shopify apps', 'shopify product recommendations'), false);
  });
});
