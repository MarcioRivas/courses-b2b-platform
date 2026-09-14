-- Phase 7 — audit log query indexes + immutability re-assertion (D28).
--
-- `audit_logs (organization_id, created_at desc)` already exists from Phase 1
-- (`audit_logs_organization_id_created_at_idx`, 20260909120600_audit_log.sql);
-- adding it again would be a dead duplicate index, so only the two indexes the
-- Phase 1 migration is missing are created here.

create index audit_logs_actor_user_id_created_at_idx on audit_logs (actor_user_id, created_at desc);
create index audit_logs_action_idx on audit_logs (action);

-- Regression guard: `log_audit` (RPC, security definer) must remain the only
-- write path onto `audit_logs`. If a future migration ever adds an
-- INSERT/UPDATE/DELETE policy for `authenticated`, fail the migration loudly
-- instead of silently reopening the immutability guarantee.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and 'authenticated' = any(roles)
  ) then
    raise exception 'audit_logs has an INSERT/UPDATE/DELETE policy for authenticated — violates D28';
  end if;
end;
$$;

revoke insert, update, delete on audit_logs from authenticated, anon;
