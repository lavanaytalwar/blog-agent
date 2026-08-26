import type { Cluster, Persona, Secondary } from '../config/types.js';

export type KeywordBudget = {
  primary: [number, number];
  secondariesCombined: [number, number];
};

export type BriefClaim = { value: string; source: string };

export type SerpCoverage = { url: string; headings: string[] };

export type Brief = {
  primaryKeyword: string;
  secondaries: Secondary[];
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
  /** Titles already published, so the draft does not restate one. */
  existingTitles: string[];

  /** Present only on the seasonal cluster. */
  audienceGuard?: { rule: string; avoid: string[] };

  attempt: number;
  /** Feedback from a rejected attempt. */
  note?: string;
};
