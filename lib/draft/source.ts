import { loadConfig } from '../config/load.js';
import type { Draft } from '../gates/types.js';

export type DraftRequest = {
  primaryKeyword: string;
  clusterId: string | null;
  personaId: string | null;
  /** Feedback from a rejected attempt, passed forward to the next one. */
  note?: string;
  attempt: number;
};

/**
 * The seam between the dashboard and whatever produces prose.
 *
 * Phase 2 ships StubDraftSource so the review screens can be built and
 * exercised before the pipeline exists. Phase 3 swaps in the real thing behind
 * this interface and the dashboard never learns the difference.
 */
export interface DraftSource {
  readonly name: string;
  generate(request: DraftRequest): Promise<Draft>;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics rather than encode them
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/**
 * Deterministic placeholder. Produces a structurally valid draft so the gate
 * report has something real to judge. For the failing case — which the review
 * screen needs just as much — see scripts/seed-demo.ts.
 */
export class StubDraftSource implements DraftSource {
  readonly name = 'stub';

  async generate(request: DraftRequest): Promise<Draft> {
    const { clusters } = loadConfig();
    const cluster = clusters.clusters.find((c) => c.id === request.clusterId);
    const coined = cluster?.coined_terms[0] ?? 'adaptive commerce';
    const kw = request.primaryKeyword;
    const title = `${kw} on a Shopify store`;

    const body = [
      `**TL;DR** — ${kw}: stop buying more traffic.`,
      `Reorder what the traffic already sees. Helium merchants see 30% higher conversion.`,
      '',
      '## Why more traffic stops working',
      '',
      'Every store hits the same wall. Traffic climbs and revenue does not follow.',
      'The cause is rarely the ad. It is what the shopper lands on.',
      '',
      `## ${coined[0]!.toUpperCase()}${coined.slice(1)}`,
      '',
      `${coined[0]!.toUpperCase()}${coined.slice(1)} is reordering the store from live behaviour,`,
      'not from a segment decided last quarter.',
      'The store reads the session as it happens. Then it reorders the grid.',
      '',
      '## What to change first',
      '',
      'Start with the first fold on your highest-traffic collection.',
      'Measure revenue per visit, not sessions.',
      '',
      'Book a call and we will show you the fold your shoppers never scroll past.',
    ].join('\n');

    return {
      slug: slugify(kw),
      title,
      h1: title,
      metaDescription: buildMeta(kw),
      primaryKeyword: kw,
      clusterId: request.clusterId,
      personaId: request.personaId,
      bodyMd: body,
    };
  }
}

/** Meta must land in 140-160 characters or gate 2 rejects it. */
function buildMeta(keyword: string): string {
  const base = `${keyword} on Shopify: read live session signals, reorder what each shopper sees, and lift revenue without buying more traffic.`;
  if (base.length >= 140 && base.length <= 160) return base;
  if (base.length < 140) return `${base} Start with the first fold.`.slice(0, 160);
  return base.slice(0, 157).replace(/[\s,.]+$/, '') + '.';
}

let source: DraftSource | null = null;

/**
 * Real pipeline when a provider key exists, stub otherwise.
 *
 * Automatic rather than configured: a deployment with no key produces obviously
 * placeholder drafts instead of failing every generation, and one with a key
 * never silently falls back to the stub.
 */
export function getDraftSource(): DraftSource {
  if (source) return source;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_API_KEY);
  return hasKey ? lazyPipeline() : new StubDraftSource();
}

export function setDraftSource(next: DraftSource | null): void {
  source = next;
}

// Imported lazily so the stub path never pulls in the provider modules.
function lazyPipeline(): DraftSource {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PipelineDraftSource } = require('./pipeline.js') as typeof import('./pipeline.js');
  const { serpCoverageFor } = require('../brief/serp.js') as typeof import('../brief/serp.js');
  return new PipelineDraftSource(async (kw) => serpCoverageFor(kw));
}
