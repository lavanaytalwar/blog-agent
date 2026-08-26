import type { Draft, GateContext } from './types.js';

/**
 * A draft that passes all five gates against the real config/ files.
 * Tests mutate a copy of this, so every failure test isolates one rule.
 */
export const passingDraft: Draft = {
  slug: 'how-to-improve-revenue-per-visitor',
  title: 'How to improve revenue per visitor on a Shopify store',
  h1: 'How to improve revenue per visitor on a Shopify store',
  metaDescription:
    'How to improve revenue per visitor on Shopify: read live session signals, ' +
    'reorder what each shopper sees, and lift revenue without buying more traffic.',
  primaryKeyword: 'How to improve revenue per visitor',
  clusterId: 'conversion-rate',
  personaId: 'ecommerce-leadership',
  bodyMd: [
    '**TL;DR** — How to improve revenue per visitor: stop buying more traffic.',
    'Reorder what the traffic already sees. Helium merchants see 30% higher conversion.',
    '',
    '## Why more traffic stops working',
    '',
    'Every store hits the same wall. Traffic climbs and revenue does not follow.',
    'The cause is rarely the ad. It is what the shopper lands on.',
    'Your best product sits below the fold. The shopper never scrolls.',
    '',
    '## Session-aware merchandising',
    '',
    'Session-aware merchandising is reordering products from live behaviour,',
    'not from a segment decided last quarter.',
    'The store reads the session as it happens. Then it reorders the grid.',
    'A shopper who filters by size sees stock in that size first.',
    '',
    '## What to change first',
    '',
    'Start with the first fold on your highest-traffic collection.',
    'Measure revenue per visit, not sessions.',
    'Then extend the same logic to search and to the cart.',
    '',
    'Book a call and we will show you the fold your shoppers never scroll past.',
  ].join('\n'),
};

export const emptyContext: GateContext = { existingSlugs: [], targetedKeywords: [] };

export const draft = (overrides: Partial<Draft> = {}): Draft => ({ ...passingDraft, ...overrides });
