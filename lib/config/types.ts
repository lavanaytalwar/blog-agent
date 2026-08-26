export type Persona = { id: string; name: string; titles: string[]; owns: string[] };

export type AudienceGuard = {
  reason: string;
  negative_intent_terms: string[];
  rule: string;
};

export type Cluster = {
  id: string;
  name: string;
  key_problem: string;
  personas: string[];
  commercial_url: string;
  secondary_commercial_url?: string;
  coined_terms: string[];
  sheet_keywords?: string[];
  live_posts?: string[];
  engine: 'diagnostic' | 'seasonal';
  audience_guard?: AudienceGuard;
  approved_contrast_targets?: string[];
  stance?: string;
  notes?: string;
};

export type ExcludedKeyword = { keyword: string; reason: string; action: string };

export type ClustersConfig = {
  personas: Persona[];
  clusters: Cluster[];
  excluded_keywords: ExcludedKeyword[];
};

export type KeywordStatus = 'available' | 'flagged' | 'unmapped' | 'in_progress' | 'covered' | 'excluded';

export type Secondary = {
  keyword: string;
  source: 'gsc' | 'serp' | 'proposed';
  impressions: number;
  position: number;
  window: string;
  variants?: string[];
};

export type Keyword = {
  keyword: string;
  cluster_id: string | null;
  outline: string | null;
  serp_competitors: string[];
  clean_room_top5?: string[];
  push_target: string | null;
  status: KeywordStatus;
  entity_risk?: string;
  exclusion_reason?: string;
  note?: string;
  source?: string;
  secondary_keywords?: Secondary[];
  secondary_source?: 'gsc' | 'serp' | 'proposed' | 'none' | 'excluded';
};

export type KeywordsConfig = { keywords: Keyword[] };

export type Claim = {
  key: string;
  value: string;
  numerals: string[];
  tier: string;
  source_ref: string;
  /** Named-customer claims only: which brand this result belongs to. */
  customer?: string;
};

export type BlockedClaim = Claim & {
  blocked_reason: string;
  /** Literal strings that identify this blocked claim in prose. */
  patterns: string[];
};

export type ClaimLedger = {
  ratified_at: string;
  claims: Claim[];
  blocked: BlockedClaim[];
};

type TermList = { terms: string[] };

export type Blocklist = {
  competitors_banned_in_slug_title_h1: string[];
  approved_contrast_targets: TermList;
  banned_phrases: TermList;
  banned_ai_mysticism: TermList;
  hedges: TermList;
  hard_superlatives: TermList;
  enterprise_jargon: TermList;
  required_title_qualifiers: TermList;
  approved_public_customers: { names: string[] };
  approved_ctas: TermList;
  coined_terms: TermList;
};

export type Config = {
  clusters: ClustersConfig;
  keywords: KeywordsConfig;
  ledger: ClaimLedger;
  blocklist: Blocklist;
};
