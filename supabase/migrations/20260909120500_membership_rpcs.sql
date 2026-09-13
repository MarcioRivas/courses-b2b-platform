-- Membership management RPCs (docs/database-schema.md, decisions D24, D25, D29)
-- Used by the Phase 2 UI; created now because the D24 policies leave no other
-- write path onto organization_memberships.

create function set_membership_role(p_membership uuid, p_role membership_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership organization_memberships%rowtype;
  v_remaining_admins int;
begin
  select * into v_membership
  from organization_memberships
  where id = p_membership;

  if v_membership.id is null then
    raise exception 'Membership not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_membership.organization_id)), false) is not true then
    raise exception 'Only an organization admin can change member roles' using errcode = 'insufficient_privilege';
  end if;

  if v_membership.user_id = (select auth.uid()) then
    raise exception 'Cannot change your own membership role' using errcode = 'invalid_parameter_value';
  end if;

  if v_membership.role = 'ADMIN' and v_membership.status = 'ACTIVE' and p_role <> 'ADMIN' then
    select count(*) into v_remaining_admins
    from organization_memberships
    where organization_id = v_membership.organization_id
      and role = 'ADMIN'
      and status = 'ACTIVE'
      and id <> p_membership;

    if v_remaining_admins = 0 then
      raise exception 'Organization must keep at least one ACTIVE admin' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  update organization_memberships
  set role = p_role
  where id = p_membership;

  perform log_audit(
    v_membership.organization_id,
    'member.role_changed',
    'organization_membership',
    p_membership,
    jsonb_build_object('from_role', v_membership.role, 'to_role', p_role)
  );
end;
$$;

revoke execute on function set_membership_role(uuid, membership_role) from public, anon;
grant execute on function set_membership_role(uuid, membership_role) to authenticated;

create function set_membership_status(p_membership uuid, p_status membership_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership organization_memberships%rowtype;
  v_remaining_admins int;
begin
  select * into v_membership
  from organization_memberships
  where id = p_membership;

  if v_membership.id is null then
    raise exception 'Membership not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_membership.organization_id)), false) is not true then
    raise exception 'Only an organization admin can change member status' using errcode = 'insufficient_privilege';
  end if;

  if v_membership.user_id = (select auth.uid()) then
    raise exception 'Cannot change your own membership status' using errcode = 'invalid_parameter_value';
  end if;

  if v_membership.role = 'ADMIN' and v_membership.status = 'ACTIVE' and p_status = 'INACTIVE' then
    select count(*) into v_remaining_admins
    from organization_memberships
    where organization_id = v_membership.organization_id
      and role = 'ADMIN'
      and status = 'ACTIVE'
      and id <> p_membership;

    if v_remaining_admins = 0 then
      raise exception 'Organization must keep at least one ACTIVE admin' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  update organization_memberships
  set status = p_status
  where id = p_membership;

  if p_status = 'INACTIVE' and to_regclass('public.course_enrollments') is not null then
    -- Scoped to this org only (D29): a member deactivated in org A must keep
    -- their ACTIVE enrollments in any other org they also belong to.
    execute format(
      'update course_enrollments set status = ''CANCELLED'' where user_id = %L and organization_id = %L and status = ''ACTIVE''',
      v_membership.user_id,
      v_membership.organization_id
    );
  end if;

  perform log_audit(
    v_membership.organization_id,
    'member.status_changed',
    'organization_membership',
    p_membership,
    jsonb_build_object('from_status', v_membership.status, 'to_status', p_status)
  );
end;
$$;

revoke execute on function set_membership_status(uuid, membership_status) from public, anon;
grant execute on function set_membership_status(uuid, membership_status) to authenticated;
