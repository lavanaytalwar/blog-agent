export type GateName =
  | 'strategy' | 'structure' | 'provenance' | 'cannibalization' | 'tone_floor';

/** A draft as the gates see it. Deliberately plain — no database, no IO. */
export type Draft = {
  slug: string;
  title: string;
  h1: string;
  metaDescription: string;
  bodyMd: string;
  primaryKeyword: string;
  clusterId: string | null;
  personaId: string | null;
};

/** What else the gates need to judge a draft. Passed in, never fetched. */
export type GateContext = {
  /** Slugs already live or already drafted. Cannibalization gate. */
  existingSlugs: string[];
  /** Primary keywords already targeted by a post. Cannibalization gate. */
  targetedKeywords: string[];
};

export type Failure = {
  rule: string;
  message: string;
  evidence?: string;
};

export type GateResult = {
  gate: GateName;
  passed: boolean;
  failures: Failure[];
};

export type GateReport = {
  passed: boolean;
  results: GateResult[];
  failureCount: number;
};

export const pass = (gate: GateName): GateResult => ({ gate, passed: true, failures: [] });

export const result = (gate: GateName, failures: Failure[]): GateResult => ({
  gate,
  passed: failures.length === 0,
  failures,
});
