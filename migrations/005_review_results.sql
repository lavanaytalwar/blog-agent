-- The advisory review pass: one model reading of a draft, per attempt.
--
-- Separate from gate_results, and deliberately not a column on posts, because
-- the two must never be confused at the point of use. gate_results decides
-- posts.status; nothing in this table can. A reviewer that fails stores a row
-- with status 'unavailable' and the reason, so "the review found nothing" is
-- always distinguishable from "the review did not run".
create table if not exists review_results (
  id                bigserial primary key,
  post_id           bigint not null references posts(id) on delete cascade,
  run_index         int not null default 1,
  status            text not null check (status in ('reviewed','unavailable')),
  model             text,
  notes             jsonb not null default '[]',
  reason            text,
  created_at        timestamptz not null default now(),
  unique (post_id, run_index)
);

create index if not exists review_results_post_idx on review_results (post_id);
