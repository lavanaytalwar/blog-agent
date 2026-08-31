-- Retire the `published` and `measured` post statuses.
--
-- Publishing is a manual action taken outside this system: the engine's job
-- ends at `approved`, and a human pastes the markdown into the CMS. Nothing
-- ever wrote either status, so the per-post measurement path they gated was
-- unreachable rather than merely unused.
--
-- The `measurements` table and the `published_at` / `published_url` columns are
-- deliberately left in place. They hold no rows today, dropping them would be
-- the one irreversible half of this change, and re-enabling per-post readings
-- later should be a code change rather than a migration.
alter table posts drop constraint if exists posts_status_check;

alter table posts add constraint posts_status_check
  check (status in ('drafted','failed_gates','awaiting_approval',
                    'approved','discarded'));
