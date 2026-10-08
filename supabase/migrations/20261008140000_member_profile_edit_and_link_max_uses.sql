-- Admin edits member profile data; registration-link max uses.
-- Redefines get_registration_link_public, create_registration_link and
-- complete_registration (profile validation + DNI-per-org uniqueness + max_uses).

-- ---------------------------------------------------------------------------
-- Link max uses (null = unlimited)
-- ---------------------------------------------------------------------------
alter table organization_registration_links
  add column max_uses int check (max_uses > 0);

-- DNI comparison form: lowercase letters + digits only ("1.234.567-8" == "12345678").
create function normalize_dni(p_dni text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(lower(coalesce(p_dni, '')), '[^a-z0-9]', '', 'g');
$$;

revoke execute on function normalize_dni(text) from public, anon;
grant execute on function normalize_dni(text) to authenticated;

-- Non-unique: DNI uniqueness is per organization, enforced in the RPCs.
create index profile_private_dni_normalized_idx on profile_private (normalize_dni(dni));

-- Report (never fail on) pre-existing duplicate DNIs within one organization.
do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select m.organization_id, normalize_dni(pp.dni)
    from profile_private pp
    join organization_memberships m on m.user_id = pp.user_id
    where normalize_dni(pp.dni) <> ''
    group by 1, 2
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise notice 'Found % duplicate DNI group(s) within an organization (left untouched)', v_dupes;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared profile validation (internal; only called from definer functions)
-- ---------------------------------------------------------------------------
create function assert_valid_profile_fields(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_dni text
)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if length(trim(coalesce(p_first_name, ''))) not between 1 and 80
     or length(trim(coalesce(p_last_name, ''))) not between 1 and 80 then
    raise exception 'INVALID_PROFILE' using errcode = 'invalid_parameter_value';
  end if;

  if nullif(trim(coalesce(p_phone, '')), '') is not null
     and (length(trim(p_phone)) not between 6 and 20 or trim(p_phone) !~ '^[0-9 ()+.-]+$') then
    raise exception 'INVALID_PROFILE' using errcode = 'invalid_parameter_value';
  end if;

  if length(trim(coalesce(p_dni, ''))) not between 6 and 15 or normalize_dni(p_dni) = '' then
    raise exception 'INVALID_PROFILE' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke execute on function assert_valid_profile_fields(text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_registration_link_public: + exhausted flag (return type changes)
-- ---------------------------------------------------------------------------
drop function get_registration_link_public(text);

create function get_registration_link_public(p_token text)
returns table (organization_name text, valid boolean, exhausted boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_link organization_registration_links%rowtype;
  v_org_name text;
  v_exhausted boolean;
begin
  select * into v_link
  from organization_registration_links
  where token = p_token;

  if v_link.id is null then
    return query select null::text, false, false;
    return;
  end if;

  select name into v_org_name from organizations where id = v_link.organization_id;

  v_exhausted := v_link.max_uses is not null and v_link.use_count >= v_link.max_uses;

  return query
  select
    v_org_name,
    (
      v_link.is_active
      and v_link.revoked_at is null
      and (v_link.expires_at is null or v_link.expires_at > now())
      and not v_exhausted
    ),
    (
      v_exhausted
      and v_link.is_active
      and v_link.revoked_at is null
      and (v_link.expires_at is null or v_link.expires_at > now())
    );
end;
$$;

revoke execute on function get_registration_link_public(text) from public;
grant execute on function get_registration_link_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_registration_link: + p_max_uses
-- ---------------------------------------------------------------------------
drop function create_registration_link(uuid, text, membership_role, timestamptz);

create function create_registration_link(
  p_org uuid,
  p_label text,
  p_role membership_role default 'STUDENT',
  p_expires_at timestamptz default null,
  p_max_uses int default null
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

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'max_uses must be positive' using errcode = 'invalid_parameter_value';
  end if;

  v_expires_at := coalesce(p_expires_at, now() + interval '30 days');

  if v_expires_at <= now() then
    raise exception 'Expiry must be in the future' using errcode = 'invalid_parameter_value';
  end if;

  insert into organization_registration_links (organization_id, label, default_role, expires_at, max_uses, created_by)
  values (v_org.id, nullif(trim(coalesce(p_label, '')), ''), p_role, v_expires_at, p_max_uses, (select auth.uid()))
  returning organization_registration_links.id, organization_registration_links.token
  into v_id, v_token;

  -- Never audit the token itself: it is a credential (Phase 2 security notes).
  perform log_audit(
    v_org.id,
    'registration_link.created',
    'organization_registration_link',
    v_id,
    jsonb_build_object('default_role', p_role, 'expires_at', v_expires_at, 'max_uses', p_max_uses)
  );

  return query select v_id, v_token;
end;
$$;

revoke execute on function create_registration_link(uuid, text, membership_role, timestamptz, int) from public, anon;
grant execute on function create_registration_link(uuid, text, membership_role, timestamptz, int) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_registration: + LINK_EXHAUSTED, profile validation, DNI per org
-- ---------------------------------------------------------------------------
create or replace function complete_registration(
  p_token text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_dni text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link organization_registration_links%rowtype;
  v_user_id uuid;
  v_email citext;
  v_org_status org_status;
  v_existing_status membership_status;
  v_rows int;
  v_org uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_link
  from organization_registration_links
  where token = p_token
  for update;

  if v_link.id is null then
    raise exception 'Invalid registration link' using errcode = 'invalid_parameter_value';
  end if;

  if not v_link.is_active or v_link.revoked_at is not null then
    raise exception 'Registration link is no longer active' using errcode = 'invalid_parameter_value';
  end if;

  if v_link.expires_at is not null and v_link.expires_at <= now() then
    raise exception 'Registration link has expired' using errcode = 'invalid_parameter_value';
  end if;

  select status into v_org_status from organizations where id = v_link.organization_id;

  if v_org_status is distinct from 'ACTIVE' then
    raise exception 'Organization is not active' using errcode = 'invalid_parameter_value';
  end if;

  select status into v_existing_status
  from organization_memberships
  where organization_id = v_link.organization_id
    and user_id = v_user_id;

  if v_existing_status = 'ACTIVE' then
    raise exception 'You are already registered in this organization' using errcode = '23505';
  end if;

  if v_existing_status = 'INACTIVE' then
    raise exception 'Membership is inactive; contact your organization admin' using errcode = 'insufficient_privilege';
  end if;

  -- The row is locked FOR UPDATE above, so concurrent registrations serialize
  -- here and can never exceed max_uses.
  if v_link.max_uses is not null and v_link.use_count >= v_link.max_uses then
    raise exception 'LINK_EXHAUSTED' using errcode = 'invalid_parameter_value';
  end if;

  perform assert_valid_profile_fields(p_first_name, p_last_name, p_phone, p_dni);

  -- Serialize concurrent claims of the same DNI per org (sorted: no deadlocks),
  -- then check every org the caller belongs to plus the one being joined.
  for v_org in
    select o from (
      select v_link.organization_id as o
      union
      select organization_id from organization_memberships where user_id = v_user_id
    ) orgs order by o
  loop
    perform pg_advisory_xact_lock(hashtext(v_org::text || ':' || normalize_dni(p_dni)));
  end loop;

  if exists (
    select 1
    from profile_private pp
    join organization_memberships m on m.user_id = pp.user_id
    where (m.organization_id = v_link.organization_id
           or m.organization_id in (select organization_id from organization_memberships where user_id = v_user_id))
      and pp.user_id <> v_user_id
      and normalize_dni(pp.dni) = normalize_dni(p_dni)
  ) then
    raise exception 'DNI_TAKEN' using errcode = '23505';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  -- profiles must exist before the organization_memberships insert below
  -- (FK organization_memberships_user_id_fkey -> profiles.id).
  insert into profiles (id, first_name, last_name)
  values (v_user_id, trim(p_first_name), trim(p_last_name))
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name;

  insert into profile_private (user_id, email, phone, dni)
  values (v_user_id, v_email, nullif(trim(coalesce(p_phone, '')), ''), trim(p_dni))
  on conflict (user_id) do update
    set email = excluded.email,
        phone = excluded.phone,
        dni = excluded.dni;

  insert into organization_memberships (organization_id, user_id, role)
  values (v_link.organization_id, v_user_id, v_link.default_role)
  on conflict (organization_id, user_id) do nothing;

  get diagnostics v_rows = row_count;

  -- Only a real membership insert counts as a "use" of the link (W8).
  if v_rows > 0 then
    update organization_registration_links
    set use_count = use_count + 1
    where id = v_link.id;

    perform log_audit(
      v_link.organization_id,
      'user.registered',
      'organization_membership',
      v_user_id,
      jsonb_build_object('role', v_link.default_role, 'link_id', v_link.id)
    );
  end if;

  return v_link.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_update_member_profile
-- ---------------------------------------------------------------------------
create function admin_update_member_profile(
  p_user uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_dni text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid;
  v_is_platform boolean;
  v_org uuid;
  v_lock_org uuid;
  v_old record;
begin
  v_caller := auth.uid();

  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  v_is_platform := coalesce((select is_platform_admin()), false);

  -- Org where the target is an ACTIVE member and the caller administers it.
  select m.organization_id into v_org
  from organization_memberships m
  where m.user_id = p_user
    and m.status = 'ACTIVE'
    and (v_is_platform or coalesce((select is_org_admin(m.organization_id)), false))
  order by m.joined_at
  limit 1;

  if v_org is null then
    if exists (select 1 from organization_memberships where user_id = p_user) then
      raise exception 'Not allowed to edit this member' using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Member not found' using errcode = 'no_data_found';
  end if;

  -- Profiles are global: an org admin may only edit members that belong to
  -- no other org, and never an ORG_ADMIN or platform admin.
  if not v_is_platform then
    if exists (
         select 1 from organization_memberships
         where user_id = p_user and (organization_id <> v_org or role = 'ADMIN')
       )
       or exists (select 1 from platform_admins where user_id = p_user) then
      raise exception 'Not allowed to edit this member' using errcode = 'insufficient_privilege';
    end if;
  end if;

  perform assert_valid_profile_fields(p_first_name, p_last_name, p_phone, p_dni);

  for v_lock_org in
    select organization_id from organization_memberships where user_id = p_user order by organization_id
  loop
    perform pg_advisory_xact_lock(hashtext(v_lock_org::text || ':' || normalize_dni(p_dni)));
  end loop;

  if exists (
    select 1
    from profile_private pp
    join organization_memberships m on m.user_id = pp.user_id
    where m.organization_id in (select organization_id from organization_memberships where user_id = p_user)
      and pp.user_id <> p_user
      and normalize_dni(pp.dni) = normalize_dni(p_dni)
  ) then
    raise exception 'DNI_TAKEN' using errcode = '23505';
  end if;

  select p.first_name, p.last_name, pp.phone, pp.dni into v_old
  from profiles p
  join profile_private pp on pp.user_id = p.id
  where p.id = p_user
  for update of p, pp;

  if not found then
    raise exception 'Member not found' using errcode = 'no_data_found';
  end if;

  update profiles
  set first_name = trim(p_first_name), last_name = trim(p_last_name)
  where id = p_user;

  update profile_private
  set phone = nullif(trim(coalesce(p_phone, '')), ''), dni = trim(p_dni)
  where user_id = p_user;

  perform log_audit(
    v_org,
    'member.profile_updated',
    'organization_membership',
    p_user,
    jsonb_build_object(
      'from', jsonb_build_object(
        'first_name', v_old.first_name, 'last_name', v_old.last_name, 'phone', v_old.phone, 'dni', v_old.dni),
      'to', jsonb_build_object(
        'first_name', trim(p_first_name), 'last_name', trim(p_last_name),
        'phone', nullif(trim(coalesce(p_phone, '')), ''), 'dni', trim(p_dni))
    )
  );
end;
$$;

revoke execute on function admin_update_member_profile(uuid, text, text, text, text) from public, anon;
grant execute on function admin_update_member_profile(uuid, text, text, text, text) to authenticated;
