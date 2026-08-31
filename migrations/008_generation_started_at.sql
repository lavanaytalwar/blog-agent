-- When the current generation attempt began.
--
-- `status = 'drafted'` has always meant two different things: a draft being
-- written right now, and a draft whose generation was killed partway through.
-- They were indistinguishable, so a dead post showed "Generating…" forever and
-- the only way to tell was to read the database.
--
-- `created_at` cannot serve as the clock. A regenerate reuses the row, setting
-- status back to 'drafted' and body_md to null while leaving created_at at the
-- original insert, so a freshly requested attempt 2 on a day-old post would
-- read as instantly dead.
alter table posts add column if not exists generation_started_at timestamptz;

-- Rows already stuck when this shipped never recorded a start, and every one of
-- them is long dead. Seeding from created_at makes them read as stalled instead
-- of as never-started.
update posts set generation_started_at = created_at
  where status = 'drafted' and body_md is null and generation_started_at is null;
