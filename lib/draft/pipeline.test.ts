import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineDraftSource } from './pipeline.js';
import { setProvider, type CompleteInput, type LlmProvider } from '../llm/index.js';
import { runGates } from '../gates/index.js';

/**
 * Proves brief -> prompt -> model -> parse -> gates connects end to end,
 * without reaching the network. The fake records the prompt it was given so the
 * test can assert on what the model was actually told.
 */
class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  lastSystem = '';

  constructor(private readonly reply: string) {}

  async complete(input: CompleteInput) {
    this.lastSystem = input.system;
    return { text: this.reply, model: this.model };
  }
}

const GOOD_DRAFT = `---
slug: ecommerce-personalization-for-shopify-stores
title: Ecommerce personalization that lifts revenue per visit on Shopify
h1: Ecommerce personalization that lifts revenue per visit on Shopify
meta_description: "Ecommerce personalization on Shopify: read live session signals, reorder what each shopper sees, and lift revenue without buying a single extra visit."
primary_keyword: ecommerce personalization
cluster: conversion-rate
persona: ecommerce-leadership
---

**TL;DR** — Ecommerce personalization is not a widget. It is what the shopper sees first.
Helium merchants see 30% higher conversion.

## Why more traffic stops working

Every store hits the same wall. Traffic climbs and revenue does not follow.
The cause is rarely the ad. It is what the shopper lands on.

## Adaptive commerce

Adaptive commerce is reshaping the journey from live session signals,
not from a segment decided last quarter.
The store reads the session as it happens. Then it reorders the grid.

## What to change first

Start with the first fold on your highest-traffic collection.
Measure revenue per visit, not sessions.

Book a call and we will show you the fold your shoppers never scroll past.`;

afterEach(() => setProvider(null));

describe('the draft pipeline', () => {
  test('turns a keyword into a gated draft', async () => {
    const fake = new FakeProvider(GOOD_DRAFT);
    setProvider(fake);

    const draft = await new PipelineDraftSource().generate({
      primaryKeyword: 'ecommerce personalization / personalization for ecommerce',
      clusterId: 'conversion-rate',
      personaId: 'ecommerce-leadership',
      attempt: 1,
    });

    assert.equal(draft.slug, 'ecommerce-personalization-for-shopify-stores');

    const report = runGates(draft, { existingSlugs: [], targetedKeywords: [] });
    const failures = report.results.flatMap((r) => r.failures.map((f) => f.rule));
    assert.ok(!failures.includes('claim.untraceable'), JSON.stringify(failures));
    assert.ok(!failures.includes('tone.hedging'), JSON.stringify(failures));
  });

  test('the model is told which numbers it may use', async () => {
    const fake = new FakeProvider(GOOD_DRAFT);
    setProvider(fake);
    await new PipelineDraftSource().generate({
      primaryKeyword: 'ecommerce personalization / personalization for ecommerce',
      clusterId: 'conversion-rate', personaId: 'ecommerce-leadership', attempt: 1,
    });
    assert.ok(fake.lastSystem.includes('30% higher conversion'));
    assert.ok(fake.lastSystem.includes('checked against a ledger'));
  });

  test('the prompt never contains a confidential merchant', async () => {
    const fake = new FakeProvider(GOOD_DRAFT);
    setProvider(fake);
    await new PipelineDraftSource().generate({
      primaryKeyword: 'ecommerce personalization / personalization for ecommerce',
      clusterId: 'conversion-rate', personaId: 'ecommerce-leadership', attempt: 1,
    });
    for (const secret of ['Ted Baker', 'Swiss Beauty', 'BBlunt', 'Kisah', 'Wrogn']) {
      assert.ok(!fake.lastSystem.includes(secret), `${secret} must never reach a prompt`);
    }
    assert.ok(fake.lastSystem.includes('Lenskart'), 'the allowlist does go in');
  });

  test('a model refusal fails loudly rather than producing an empty post', async () => {
    setProvider(new FakeProvider('I am not able to help with that.'));
    await assert.rejects(
      () => new PipelineDraftSource().generate({
        primaryKeyword: 'ecommerce personalization / personalization for ecommerce',
        clusterId: 'conversion-rate', personaId: 'ecommerce-leadership', attempt: 1,
      }),
      /not a valid draft/,
    );
  });

  test('cached SERP coverage reaches the prompt', async () => {
    const fake = new FakeProvider(GOOD_DRAFT);
    setProvider(fake);
    await new PipelineDraftSource(
      async () => [{ url: 'example.com/guide', headings: ['A distinctive heading here'] }],
    ).generate({
      primaryKeyword: 'ecommerce personalization / personalization for ecommerce',
      clusterId: 'conversion-rate', personaId: 'ecommerce-leadership', attempt: 1,
    });
    assert.ok(fake.lastSystem.includes('A distinctive heading here'));
  });
});
