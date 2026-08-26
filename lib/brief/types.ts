import type { Cluster, Persona, Secondary } from '../config/types.js';
import type { SerpLesson } from '../serp/analyze.js';

export type KeywordBudget = {
  primary: [number, number];
  secondariesCombined: [number, number];
};

export type BriefClaim = { value: string; source: string };

/**
 * One keyword the post is being asked to own, with the secondaries attached to
 * it. A post has one lead target — which drives the slug, title, H1 and meta —
 * and zero or more additional ones selected alongside it.
 */
export type BriefTarget = { keyword: string; secondaries: Secondary[] };

export type SerpCoverage = { url: string; headings: string[] };

export type Brief = {
  /** The lead target. Owns the slug, title, H1 and meta description. */
  primaryKeyword: string;
  /** The lead target's own secondaries. */
  secondaries: Secondary[];
  /**
   * Further primaries selected alongside the lead. Their secondaries are
   * enforced exactly like the lead's, and every one of them is retired from the
   * keyword list when the post publishes.
   */
  additionalTargets: BriefTarget[];
  cluster: Cluster;
  persona: Persona;
  commercialUrl: string;
  budget: KeywordBudget;

  /** Every number the draft is permitted to state. */
  allowedClaims: BriefClaim[];
  /** Facts that exist but are not settled — stated so the model does not reach for them. */
  blockedClaims: { value: string; reason: string }[];

  /** Only brands already public in Helium's own marketing. */
  namableCustomers: string[];

  voice: {
    requiredQualifiers: string[];
    coinedTerms: string[];
    approvedCtas: string[];
    approvedContrastTargets: string[];
    bannedPhrases: string[];
    hedges: string[];
    hardSuperlatives: string[];
  };

  /** What the pages that currently rank actually cover. */
  serpCoverage: SerpCoverage[];
  /**
   * Measured off those same pages: how long they run, how they are shaped, how
   * fresh they are. Absent until `npm run serp:analyze` has been run for this
   * keyword.
   */
  serpLesson?: { takenOn: string; source: string; lesson: SerpLesson };
  /**
   * The character floor gate 2 enforces. Imported from the gate so the prompt
   * states the same number it will be judged against rather than a parallel one
   * that can drift.
   */
  lengthFloor: number;
  /**
   * Advisory word range stated in the prompt, tracking the SERP median where one
   * has been measured. A target, never a threshold: a keyword whose SERP is
   * 2,000-word guides should not be answered with a 700-word post, but no draft
   * is failed for missing this.
   */
  wordTarget: [number, number];
  /** Titles already published, so the draft does not restate one. */
  existingTitles: string[];

  /** Present only on the seasonal cluster. */
  audienceGuard?: { rule: string; avoid: string[] };

  attempt: number;
  /** Feedback from a rejected attempt. */
  note?: string;
};
