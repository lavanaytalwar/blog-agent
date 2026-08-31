-- Keywords a human has accepted from the mining check on the dashboard.
--
-- Mirrors keyword_rejections: the dashboard runs on a read-only filesystem and
-- cannot write config/keywords.json directly, so a decision to accept a
-- candidate is staged here first. `npm run keywords:apply-accepted` folds this
-- table into config/keywords.json (new primaries as 'unmapped', secondaries
-- onto their primary's list) and clears it — the config file stays the
-- committed source of truth, and a change to targeting still shows up as a
-- diff, but the selection itself happens from the UI instead of by hand.
--
-- Keyed by fingerprint for the same reason rejections are: accepting
-- "ecommerce personalization tool" should not leave "ecommerce personalisation
-- tools" free to be proposed again as if it were a different candidate.
create table if not exists keyword_acceptances (
  fingerprint       text primary key,
  keyword           text not null,
  scope             text not null default 'secondary'
                    check (scope in ('primary','secondary')),
  primary_keyword   text,
  impressions       int,
  clicks            int,
  position          numeric,
  first_seen        text,
  last_seen         text,
  variants          text[] not null default '{}',
  accepted_at       timestamptz not null default now()
);

create index if not exists keyword_acceptances_accepted_at_idx
  on keyword_acceptances (accepted_at desc);
