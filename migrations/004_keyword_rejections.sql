-- Keywords a human has explicitly said no to, from the dashboard.
--
-- Lives in the database rather than config/ because the dashboard runs on a
-- read-only filesystem and cannot write a JSON file. config/keyword-history.json
-- stays the durable, committed memory: `npm run keywords:rejections` folds this
-- table into it as `rejected` entries, and mining unions both sources so a
-- rejection takes effect immediately, before anyone runs the sync.
--
-- Keyed by fingerprint, not by the typed string, so rejecting
-- "ecommerce personalization tool" also kills "ecommerce personalisation tools".
create table if not exists keyword_rejections (
  fingerprint       text primary key,
  keyword           text not null,
  scope             text not null default 'primary'
                    check (scope in ('primary','secondary')),
  primary_keyword   text,
  reason            text,
  rejected_at       timestamptz not null default now()
);

create index if not exists keyword_rejections_rejected_at_idx
  on keyword_rejections (rejected_at desc);
