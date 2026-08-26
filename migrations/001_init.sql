-- blogEO schema, phase 0
-- Idempotent: safe to re-run.

create table if not exists clusters (
  id                text primary key,
  name              text not null,
  key_problem       text not null,
  personas          text[] not null default '{}',
  commercial_url    text not null,
  coined_terms      text[] not null default '{}',
  engine            text not null check (engine in ('diagnostic','seasonal')),
  audience_guard    jsonb,
  notes             text,
  updated_at        timestamptz not null default now()
);

create table if not exists personas (
  id                text primary key,
  name              text not null,
  titles            text[] not null default '{}',
  owns              text[] not null default '{}'
);

create table if not exists keywords (
  keyword           text primary key,
  cluster_id        text references clusters(id),
  outline           text,
  serp_competitors  text[] not null default '{}',
  push_target       text,
  status            text not null default 'available'
                    check (status in ('available','flagged','in_progress','covered','excluded')),
  entity_risk       text,
  exclusion_reason  text,
  updated_at        timestamptz not null default now()
);

-- Every number a draft is allowed to state.
create table if not exists claim_ledger (
  claim_key         text primary key,
  value             text not null,
  numerals          text[] not null default '{}',   -- normalised digits gate 3 matches against
  tier              text not null check (tier in ('platform','product','onboarding','named_customer','agentcy')),
  source_ref        text not null,
  ratified_at       date not null,
  blocked           boolean not null default false, -- true = exists but must not ship (unresolved conflict)
  blocked_reason    text
);

create table if not exists posts (
  id                bigserial primary key,
  slug              text unique not null,
  title             text not null,
  h1                text,
  meta_description  text,
  primary_keyword   text references keywords(keyword),
  cluster_id        text references clusters(id),
  persona_id        text references personas(id),
  status            text not null default 'drafted'
                    check (status in ('drafted','failed_gates','awaiting_approval',
                                      'approved','discarded','published','measured')),
  body_md           text,
  gate_report       jsonb,
  model             text,
  attempt           int not null default 1,
  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  published_url     text,
  published_at      timestamptz
);
create index if not exists posts_status_idx on posts(status);
create index if not exists posts_keyword_idx on posts(primary_keyword);

create table if not exists gate_results (
  id                bigserial primary key,
  post_id           bigint not null references posts(id) on delete cascade,
  gate              text not null check (gate in ('strategy','structure','provenance',
                                                  'cannibalization','tone_floor')),
  passed            boolean not null,
  failures          jsonb not null default '[]',
  run_index         int not null default 1,
  created_at        timestamptz not null default now()
);
create index if not exists gate_results_post_idx on gate_results(post_id);

create table if not exists decisions (
  id                bigserial primary key,
  post_id           bigint not null references posts(id) on delete cascade,
  actor             text not null,
  action            text not null check (action in ('approve','discard','regenerate')),
  note              text,
  created_at        timestamptz not null default now()
);

-- Search Console. One row per (date, dimension, key). Upserted nightly.
create table if not exists gsc_snapshots (
  date              date not null,
  dimension         text not null check (dimension in ('site','page','query')),
  key               text not null,
  clicks            int  not null default 0,
  impressions       int  not null default 0,
  ctr               double precision not null default 0,
  position          double precision,
  is_branded        boolean,
  primary key (date, dimension, key)
);
create index if not exists gsc_dim_date_idx on gsc_snapshots(dimension, date desc);
create index if not exists gsc_nonbrand_idx on gsc_snapshots(dimension, is_branded, date desc);

-- Per-post readings, each stored beside a blog-wide control for the same window.
create table if not exists measurements (
  id                bigserial primary key,
  post_id           bigint not null references posts(id) on delete cascade,
  window_label      text not null check (window_label in ('publish','d28','d56')),
  window_start      date not null,
  window_end        date not null,
  captured_at       timestamptz not null default now(),
  post_clicks       int, post_impressions int, post_position double precision,
  post_nonbrand_clicks int, post_nonbrand_impressions int,
  blogwide_clicks   int, blogwide_impressions int,
  blogwide_nonbrand_clicks int, blogwide_nonbrand_impressions int,
  unique (post_id, window_label)
);

create table if not exists jobs (
  id                bigserial primary key,
  type              text not null,
  payload           jsonb not null default '{}',
  status            text not null default 'queued'
                    check (status in ('queued','running','done','failed')),
  attempts          int not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz
);
create index if not exists jobs_status_idx on jobs(status, created_at);

create table if not exists migrations_applied (
  name              text primary key,
  applied_at        timestamptz not null default now()
);
