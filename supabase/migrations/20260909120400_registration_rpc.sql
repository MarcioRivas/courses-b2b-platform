-- Registration RPCs (docs/authorization.md, decisions C4, D27, D37)

create function get_registration_link_public(p_token text)
returns table (organization_name text, valid boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_link organization_registration_links%rowtype;
  v_org_name text;
begin
  select * into v_link
  from organization_registration_links
  where token = p_token;

  if v_link.id is null then
    return query select null::text, false;
    return;
  end if;

  select name into v_org_name from organizations where id = v_link.organization_id;

  return query
  select
    v_org_name,
    (
      v_link.is_active
      and v_link.revoked_at is null
      and (v_link.expires_at is null or v_link.expires_at > now())
    );
end;
$$;

revoke execute on function get_registration_link_public(text) from public;
grant execute on function get_registration_link_public(text) to anon, authenticated;

create function complete_registration(
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

  select email into v_email from auth.users where id = v_user_id;

  -- profiles must exist before the organization_memberships insert below
  -- (FK organization_memberships_user_id_fkey -> profiles.id): a brand-new
  -- auth user who verified an OTP but never registered has no profiles row
  -- yet. Reaching this point is only possible for a genuinely new
  -- registration into this org — both ACTIVE and INACTIVE existing
  -- memberships were already rejected above — so it's safe to write the
  -- profile unconditionally here.
  insert into profiles (id, first_name, last_name)
  values (v_user_id, p_first_name, p_last_name)
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name;

  insert into profile_private (user_id, email, phone, dni)
  values (v_user_id, v_email, p_phone, p_dni)
  on conflict (user_id) do update
    set email = excluded.email,
        phone = excluded.phone,
        dni = excluded.dni;

  insert into organization_memberships (organization_id, user_id, role)
  values (v_link.organization_id, v_user_id, v_link.default_role)
  on conflict (organization_id, user_id) do nothing;

  get diagnostics v_rows = row_count;

  -- Only a real membership insert counts as a "use" of the link (W8): a
  -- no-op (e.g. a same-transaction race against another concurrent call for
  -- the same user+org) must not inflate use_count or write a duplicate
  -- audit entry.
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

revoke execute on function complete_registration(text, text, text, text, text) from public, anon;
grant execute on function complete_registration(text, text, text, text, text) to authenticated;

create function update_my_profile(
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
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  update profiles
  set first_name = p_first_name,
      last_name = p_last_name
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found for current user' using errcode = 'no_data_found';
  end if;

  update profile_private
  set phone = p_phone,
      dni = p_dni
  where user_id = v_user_id;
end;
$$;

revoke execute on function update_my_profile(text, text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text, text) to authenticated;
