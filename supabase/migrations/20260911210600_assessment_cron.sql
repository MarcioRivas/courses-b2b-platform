-- Phase 5C (part 6) — the auto-submit sweep.
--
-- The sweep is the SAFETY NET, not the primary mechanism. Auto-submission
-- happens first through the lazy path: any `heartbeat` or `save_answers_batch`
-- arriving after the deadline + 5s finalizes the attempt itself. Cron exists
-- for the student whose laptop closed and who is therefore sending nothing at
-- all — without it, that attempt would sit IN_PROGRESS forever.
--
-- This ordering matters for deployment: if pg_cron is unavailable on the hosted
-- project, the product still auto-submits for every student whose browser is
-- alive. See deploy-checklist.md (D36).
create extension if not exists pg_cron;

-- Runs as `postgres` (cron's own role), which is exactly why
-- `finalize_expired_attempts` is revoked from `authenticated`: the only caller
-- is a trusted server-side scheduler, never a session.
select cron.schedule(
  'finalize-attempts',
  '* * * * *',
  $$select finalize_expired_attempts()$$
);
