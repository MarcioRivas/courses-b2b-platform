-- RLS helper functions (docs/authorization.md, decisions C1)
-- All STABLE SECURITY DEFINER, search_path locked, revoked from public, granted to authenticated.
-- Callers must invoke as `(select fn(...))` so Postgres caches the result as an InitPlan.

create function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$;

-- Supabase applies default ACLs that grant EXECUTE to anon on every new
-- public function; `revoke ... from public` alone does not remove that
-- direct grant, so anon must always be revoked explicitly (C2).
revoke execute on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

create function user_org_role(p_org uuid)
returns membership_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from organization_memberships
  where organization_id = p_org
    and user_id = auth.uid()
    and status = 'ACTIVE'
  limit 1;
$$;

revoke execute on function user_org_role(uuid) from public, anon;
grant execute on function user_org_role(uuid) to authenticated;

create function is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select user_org_role(p_org)) is not null
    and exists (
      select 1 from organizations
      where id = p_org and status = 'ACTIVE'
    );
$$;

revoke execute on function is_org_member(uuid) from public, anon;
grant execute on function is_org_member(uuid) to authenticated;

create function is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- `user_org_role` returns NULL for non-members; without coalesce,
  -- `NULL = 'ADMIN'` yields NULL and `NULL or false` stays NULL, which every
  -- `if not (select is_org_admin(...))` guard treats as "skip the raise" (C1).
  select coalesce((select user_org_role(p_org)) = 'ADMIN', false)
    or (select is_platform_admin());
$$;

revoke execute on function is_org_admin(uuid) from public, anon;
grant execute on function is_org_admin(uuid) to authenticated;

-- Stub until Phase 3 adds `course_professors`; always returns false.
create function is_course_professor(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false;
$$;

revoke execute on function is_course_professor(uuid) from public, anon;
grant execute on function is_course_professor(uuid) to authenticated;
