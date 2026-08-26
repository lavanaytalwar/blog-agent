import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assembleBrief, BriefError, BUDGET } from './assemble.js';
import { renderSystemPrompt, renderUserMessage } from './render.js';
import { parseResponse, PipelineError } from '../draft/pipeline.js';

const KEYWORD = 'ecommerce personalization / personalization for ecommerce';

describe('brief assembly', () => {
  test('builds a brief from a real keyword', () => {
    const b = assembleBrief({ primaryKeyword: KEYWORD });
    assert.equal(b.cluster.id, 'conversion-rate');
    assert.ok(b.persona.id);
    assert.equal(b.commercialUrl, 'https://www.gethelium.co/merchandising');
    assert.deepEqual(b.budget, BUDGET);
  });

  test('carries the secondaries mined for that primary', () => {
    const b = assembleBrief({ primaryKeyword: KEYWORD });
    assert.ok(b.secondaries.length > 0, 'this primary has Search Console evidence');
  });

  test('refuses an unknown keyword', () => {
    assert.throws(() => assembleBrief({ primaryKeyword: 'best crm software' }), BriefError);
  });

  test('refuses an excluded keyword', () => {
    assert.throws(() => assembleBrief({ primaryKeyword: 'helium recommendations' }), BriefError);
  });

  test('refuses a persona that does not belong to the cluster', () => {
    assert.throws(
      () => assembleBrief({ primaryKeyword: KEYWORD, personaId: 'merchandising-ops' }),
      BriefError,
    );
  });

  test('includes blocked claims so the model does not reach for them', () => {
    const b = assembleBrief({ primaryKeyword: KEYWORD });
    assert.ok(b.blockedClaims.some((c) => c.value.includes('₹2,000')));
  });

  test('carries the customer allowlist, never the confidential roster', () => {
    const b = assembleBrief({ primaryKeyword: KEYWORD });
    assert.ok(b.namableCustomers.includes('Lenskart'));
    const serialised = JSON.stringify(b);
    for (const secret of ['Ted Baker', 'Swiss Beauty', 'BBlunt', 'Kisah']) {
      assert.ok(!serialised.includes(secret),
        `${secret} is confidential and must never enter a brief`);
    }
  });
});

describe('prompt rendering', () => {
  test('states the numbers the draft may use', () => {
    const prompt = renderSystemPrompt(assembleBrief({ primaryKeyword: KEYWORD }));
    assert.ok(prompt.includes('30% higher conversion'));
    assert.ok(prompt.includes('checked against a ledger'));
  });

  test('names the blocked pricing rather than staying silent about it', () => {
    const prompt = renderSystemPrompt(assembleBrief({ primaryKeyword: KEYWORD }));
    assert.ok(prompt.includes('₹2,000'), 'silence invites the model to invent a price');
  });

  test('carries the seasonal audience guard only on that cluster', () => {
    const seasonal = renderSystemPrompt(assembleBrief({
      primaryKeyword: 'How to reduce wasted catalog ad spend',
    }));
    const other = renderSystemPrompt(assembleBrief({ primaryKeyword: KEYWORD }));
    assert.equal(other.includes('Audience guard'), false);
    assert.ok(typeof seasonal === 'string');
  });

  test('a redraft carries the reviewer note forward', () => {
    const b = assembleBrief({ primaryKeyword: KEYWORD, attempt: 2, note: 'Too abstract.' });
    assert.ok(renderUserMessage(b).includes('Too abstract.'));
    assert.ok(renderUserMessage(b).includes('attempt 2'));
  });
});

describe('response parsing', () => {
  const VALID = `---
slug: a-slug
title: A title
h1: A title
meta_description: "Some meta"
primary_keyword: ecommerce personalization
cluster: conversion-rate
persona: ecommerce-leadership
---

**TL;DR** — body.`;

  test('parses a clean response', () => {
    assert.equal(parseResponse(VALID).slug, 'a-slug');
  });

  test('strips a markdown fence', () => {
    assert.equal(parseResponse('```markdown\n' + VALID + '\n```').slug, 'a-slug');
  });

  test('strips a chatty preamble', () => {
    assert.equal(parseResponse(`Here's the post:\n\n${VALID}`).slug, 'a-slug');
  });

  test('fails loudly on output that is not a draft', () => {
    assert.throws(() => parseResponse('I cannot write that.'), PipelineError);
  });
});
