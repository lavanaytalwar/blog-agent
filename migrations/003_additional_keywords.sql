-- A post can be selected to own more than one keyword. The lead keeps its
-- foreign key in posts.primary_keyword; the rest live here.
--
-- Deliberately a plain text[] rather than a join table with a foreign key: the
-- keyword list is versioned in config/ and re-ingested, and a join table would
-- make a re-ingest able to fail or cascade against posts that are already
-- published. The gates re-validate every target against config on each run,
-- which is the check that actually matters.
alter table posts
  add column if not exists additional_keywords text[] not null default '{}';

create index if not exists posts_additional_keywords_idx
  on posts using gin (additional_keywords);
