-- Phase 2 admin helper RPCs (decisions D23, D24, D25, D34)
-- Tenant bootstrap, registration-link creation and group membership writes.
-- Every function: SECURITY DEFINER, locked search_path, revoked from public+anon
-- (Supabase grants anon EXECUTE by default — C2), permission asserted against
-- the organization derived from the entity row (D25).

-- ---------------------------------------------------------------------------
-- create_organization: the only way a new tenant comes into existence (D23).
-- Creates org + settings + the 4 default score ranges + one ADMIN registration
-- link (30-day expiry) and returns the token so the platform admin can hand it
-- to the organization's first administrator.
-- ---------------------------------------------------------------------------
create function create_organization(p_name text, p_slug text)
returns table (organization_id uuid, link_token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_token text;
begin
  if coalesce((select is_platform_admin()), false) is not true then
    raise exception 'Only a platform admin can create organizations' using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organization name must not be empty' using errcode = 'invalid_parameter_value';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Organization slug must be kebab-case' using errcode = 'invalid_parameter_value';
  end if;

  insert into organizations (name, slug)
  values (trim(p_name), p_slug)
  returning id into v_org_id;

  insert into organization_settings (organization_id) values (v_org_id);

  -- Spec §33 default scale; ranges are inclusive on both ends and must not
  -- overlap (score_scale_ranges exclusion constraint).
  insert into score_scale_ranges (organization_id, min_score, max_score, label, is_passing)
  values
    (v_org_id, 0, 69, 'No aprobado', false),
    (v_org_id, 70, 79, 'Bueno', true),
    (v_org_id, 80, 89, 'Muy bueno', true),
    (v_org_id, 90, 100, 'Excelente', true);

  insert into organization_registration_links (organization_id, label, default_role, expires_at, created_by)
  values (v_org_id, 'Administrador inicial', 'ADMIN', now() + interval '30 days', (select auth.uid()))
  returning token into v_token;

  perform log_audit(
    v_org_id,
    'organization.created',
    'organization',
    v_org_id,
    jsonb_build_object('name', trim(p_name), 'slug', p_slug)
  );

  return query select v_org_id, v_token;
end;
$$;

revoke execute on function create_organization(text, text) from public, anon;
grant execute on function create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_registration_link: org derived from p_org but re-validated against the
-- caller's role (D25). ADMIN links are reserved for platform admins (D23) —
-- the RLS INSERT policy blocks them too, but this is the only write path.
-- ---------------------------------------------------------------------------
create function create_registration_link(
  p_org uuid,
  p_label text,
  p_role membership_role default 'STUDENT',
  p_expires_at timestamptz default null
)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org organizations%rowtype;
  v_expires_at timestamptz;
  v_id uuid;
  v_token text;
begin
  select * into v_org from organizations where organizations.id = p_org;

  if v_org.id is null then
    raise exception 'Organization not found' using errcode = 'no_data_found';
  end if;

  if v_org.status is distinct from 'ACTIVE' then
    raise exception 'Organization is not active' using errcode = 'invalid_parameter_value';
  end if;

  if coalesce((select is_org_admin(v_org.id)), false) is not true then
    raise exception 'Only an organization admin can create registration links' using errcode = 'insufficient_privilege';
  end if;

  if p_role = 'ADMIN' and coalesce((select is_platform_admin()), false) is not true then
    raise exception 'Only a platform admin can create ADMIN registration links' using errcode = 'insufficient_privilege';
  end if;

  v_expires_at := coalesce(p_expires_at, now() + interval '30 days');

  if v_expires_at <= now() then
    raise exception 'Expiry must be in the future' using errcode = 'invalid_parameter_value';
  end if;

  insert into organization_registration_links (organization_id, label, default_role, expires_at, created_by)
  values (v_org.id, nullif(trim(coalesce(p_label, '')), ''), p_role, v_expires_at, (select auth.uid()))
  returning organization_registration_links.id, organization_registration_links.token
  into v_id, v_token;

  -- Never audit the token itself: it is a credential (Phase 2 security notes).
  perform log_audit(
    v_org.id,
    'registration_link.created',
    'organization_registration_link',
    v_id,
    jsonb_build_object('default_role', p_role, 'expires_at', v_expires_at)
  );

  return query select v_id, v_token;
end;
$$;

revoke execute on function create_registration_link(uuid, text, membership_role, timestamptz) from public, anon;
grant execute on function create_registration_link(uuid, text, membership_role, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Group membership writes (D24): the UI never inserts into group_members.
-- After each change every offering bound to the group is re-synced through the
-- Phase 3 function, guarded with to_regproc so this migration works before it
-- exists (D34/F9).
-- ---------------------------------------------------------------------------
create function sync_group_offerings(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  -- to_regprocedure, not to_regproc: to_regproc takes a BARE name and returns
  -- NULL for any parenthesised signature, which would make this guard
  -- permanently true and silently skip every sync once Phase 3 ships.
  if to_regclass('public.course_offerings') is null
     or to_regprocedure('public.sync_offering_enrollments(uuid)') is null then
    return;
  end if;

  for v_offering in
    execute format('select id from course_offerings where group_id = %L', p_group)
  loop
    execute format('select sync_offering_enrollments(%L)', v_offering);
  end loop;
end;
$$;

-- Internal helper: callable only by the RPCs below, which run as definer.
revoke execute on function sync_group_offerings(uuid) from public, anon, authenticated;

create function add_group_members(p_group uuid, p_user_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group groups%rowtype;
  v_added int;
begin
  select * into v_group from groups where groups.id = p_group;

  if v_group.id is null then
    raise exception 'Group not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_group.organization_id)), false) is not true then
    raise exception 'Only an organization admin can manage group members' using errcode = 'insufficient_privilege';
  end if;

  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  -- The assert_active_member_of_org trigger rejects any user that is not an
  -- ACTIVE STUDENT of this group's organization, including cross-org ids.
  with inserted as (
    insert into group_members (group_id, user_id, added_by)
    select p_group, u, (select auth.uid())
    from unnest(p_user_ids) as u
    on conflict (group_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_added from inserted;

  if v_added > 0 then
    perform sync_group_offerings(p_group);

    perform log_audit(
      v_group.organization_id,
      'group.member_added',
      'group',
      p_group,
      jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'added', v_added)
    );
  end if;

  return v_added;
end;
$$;

revoke execute on function add_group_members(uuid, uuid[]) from public, anon;
grant execute on function add_group_members(uuid, uuid[]) to authenticated;

create function remove_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group groups%rowtype;
  v_removed int;
begin
  select * into v_group from groups where groups.id = p_group;

  if v_group.id is null then
    raise exception 'Group not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_group.organization_id)), false) is not true then
    raise exception 'Only an organization admin can manage group members' using errcode = 'insufficient_privilege';
  end if;

  delete from group_members where group_id = p_group and user_id = p_user;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    perform sync_group_offerings(p_group);

    perform log_audit(
      v_group.organization_id,
      'group.member_removed',
      'group',
      p_group,
      jsonb_build_object('user_id', p_user)
    );
  end if;
end;
$$;

revoke execute on function remove_group_member(uuid, uuid) from public, anon;
grant execute on function remove_group_member(uuid, uuid) to authenticated;
