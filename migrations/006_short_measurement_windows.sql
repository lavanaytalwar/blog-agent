-- Short measurement windows: +7 and +14 alongside +28 and +56.
--
-- A reading at +28 days is too slow to be a feedback loop, and clicks at +28
-- on a new post are noise either way. Impressions are the signal that Google
-- is willing to rank the page at all, and they move inside a fortnight.
--
-- Postgres cannot widen a check constraint in place, so it is dropped and
-- rebuilt. Existing rows all carry the old labels and satisfy the new one.
alter table measurements drop constraint if exists measurements_window_label_check;

alter table measurements add constraint measurements_window_label_check
  check (window_label in ('publish','d7','d14','d28','d56'));
