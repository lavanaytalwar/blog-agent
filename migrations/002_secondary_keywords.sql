-- Secondary keywords, with the evidence that justified each one.
-- Stored as jsonb rather than text[] because every secondary carries its
-- impressions, average position and date window — a bare array would lose the
-- provenance that makes the list trustworthy a year from now.

alter table keywords add column if not exists secondary_keywords jsonb not null default '[]';

-- 'gsc'  evidence from Search Console
-- 'serp' derived from the ranking pages recorded in the sheet
-- 'none' no evidence exists yet; deliberately empty rather than invented
-- 'excluded' the primary is not a target at all
alter table keywords add column if not exists secondary_source text
  check (secondary_source in ('gsc', 'serp', 'proposed', 'none', 'excluded'));
