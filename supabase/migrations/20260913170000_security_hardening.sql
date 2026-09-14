-- Phase 7 security hardening. Three fixes found by the RLS matrix suite
-- (tests/security/rls-matrix.test.ts), none of which is an unexpected ALLOW —
-- see docs/security-review.md for the full writeup.

-- ---------------------------------------------------------------------------
-- Fix 1 (High): `question_banks_all`'s USING clause called
-- `can_edit_question_bank(id)`, which re-queries `question_banks` by its own
-- id. Postgres evaluates a table's USING-qualified policy against the
-- RETURNING clause of INSERT too, and the row being inserted is not yet
-- visible to a fresh self-lookup within the same statement — so ANY
-- authorized insert (`createBank`, src/features/questions/actions/
-- create-bank.ts, which does `.insert(...).select("id").single()`) was
-- silently rejected with 42501 for every caller, including legitimate org
-- admins and course professors. The original migration already worked around
-- this for WITH CHECK ("row being INSERTed is not visible to the function
-- yet") but missed that USING has the identical problem. Fix: USING now
-- inlines the same org/course check WITH CHECK already used, so no
-- self-referential lookup happens — semantically identical, RETURNING-safe.
drop policy if exists question_banks_all on question_banks;

create policy question_banks_all on question_banks
  for all to authenticated
  using (
    (select is_org_member(organization_id))
    and (
      (select is_org_admin(organization_id))
      or (course_id is not null and (select is_course_professor(course_id)))
      or (course_id is null and (select user_org_role(organization_id)) = 'PROFESSOR')
    )
  )
  with check (
    (select is_org_member(organization_id))
    and (
      (select is_org_admin(organization_id))
      or (course_id is not null and (select is_course_professor(course_id)))
      or (course_id is null and (select user_org_role(organization_id)) = 'PROFESSOR')
    )
  );

-- ---------------------------------------------------------------------------
-- Fix 2 (Medium): `profiles_select`'s "shared ACTIVE org" branch self-joined
-- `organization_memberships` directly. That table has its own RLS (`user_id =
-- auth.uid() OR is_org_admin(org)`), so a NON-admin caller (professor,
-- student) can only ever see their OWN membership row through the join — the
-- peer's ("theirs") row is invisible, the EXISTS is always false, and
-- co-members can never see each other's names. This silently broke the
-- documented capability ("profiles - SELECT by co-members of a shared ACTIVE
-- org", docs/authorization.md PII Isolation) for every non-admin role — an
-- unexpected DENY, not a privilege escalation, but real product breakage
-- (rosters, grading UI attribution, feedback names). Fix: move the self-join
-- into a SECURITY DEFINER helper (owner `postgres`, BYPASSRLS) so it reads
-- both membership rows regardless of the caller's own RLS visibility.
create function shares_active_org(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from organization_memberships mine
    join organization_memberships theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'ACTIVE'
      and theirs.user_id = p_user
      and theirs.status = 'ACTIVE'
  );
$$;

revoke execute on function shares_active_org(uuid) from public, anon;
grant execute on function shares_active_org(uuid) to authenticated;

drop policy if exists profiles_select on profiles;

create policy profiles_select on profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select is_platform_admin())
    or (select shares_active_org(id))
  );

-- ---------------------------------------------------------------------------
-- Fix 3 (Low, defense-in-depth): `organization_memberships` and
-- `platform_admins` carry a leftover table-level GRANT INSERT/UPDATE/DELETE
-- to `authenticated` from before their D24 no-direct-write policies were
-- locked down. RLS FORCE + zero matching policy already denies every such
-- statement today (see tests/security/rls-matrix.test.ts's catalog check) —
-- this is belt-and-suspenders so a future accidental permissive policy can't
-- combine with a stale grant, and it fails INSERT/UPDATE/DELETE loudly
-- (42501 permission denied) instead of silently affecting 0 rows.
-- (`audit_logs` already got this same treatment in
-- 20260913160000_audit_indexes.sql — re-revoking here would be a harmless
-- no-op, so it's intentionally left out to avoid a dead duplicate statement.)
revoke insert, update, delete on organization_memberships from authenticated;
revoke insert, update, delete on platform_admins from authenticated;
