import { strategyGate } from './strategy.js';
import { structureGate } from './structure.js';
import { provenanceGate } from './provenance.js';
import { cannibalizationGate } from './cannibalization.js';
import { toneFloorGate } from './tone-floor.js';
import type { Draft, GateContext, GateReport } from './types.js';

export * from './types.js';
export { strategyGate, structureGate, provenanceGate, cannibalizationGate, toneFloorGate };

/**
 * Runs every gate and returns the full picture.
 *
 * Deliberately does NOT short-circuit on the first failure: a redraft is more
 * useful when it can see everything wrong at once, and two redraft attempts is
 * the whole budget.
 */
export function runGates(draft: Draft, ctx: GateContext): GateReport {
  const results = [
    strategyGate(draft),
    structureGate(draft),
    provenanceGate(draft),
    cannibalizationGate(draft, ctx),
    toneFloorGate(draft),
  ];

  return {
    passed: results.every((r) => r.passed),
    results,
    failureCount: results.reduce((n, r) => n + r.failures.length, 0),
  };
}
