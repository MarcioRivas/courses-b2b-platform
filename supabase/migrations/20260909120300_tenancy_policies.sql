-- Row Level Security policies for tenancy tables (docs/authorization.md)
-- Plus the assert_active_member_of_org() trigger used by group_members (and,
-- from Phase 3 onward, course_professors).

create function assert_active_member_of_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_required_role membership_role;
begin
  if tg_table_name = 'group_members' then
    select organization_id into v_org from groups where id = new.group_id;
    v_required_role := 'STUDENT';
  elsif tg_table_name = 'course_professors' then
    select organization_id into v_org from courses where id = new.course_id;
    v_required_role := 'PROFESSOR';
  else
    raise exception 'assert_active_member_of_org: unsupported table %', tg_table_name;
  end if;

  if v_org is null then
    raise exception 'assert_active_member_of_org: could not resolve organization for %', tg_table_name;
  end if;

  if not exists (
    select 1
    from organization_memberships
    where organization_id = v_org
      and user_id = new.user_id
      and status = 'ACTIVE'
      and role = v_required_role
  ) then
    raise exception 'user % does not have an ACTIVE % membership in organization %', new.user_id, v_required_role, v_org;
  end if;

  return new;
end;
$$;

-- Trigger function: never callable directly via RPC (C2).
revoke execute on function assert_active_member_of_org() from public, anon, authenticated;

-- organizations
create policy organizations_select on organizations
  for select to authenticated
  using ((select is_platform_admin()) or (select is_org_member(id)));

create policy organizations_insert on organizations
  for insert to authenticated
  with check ((select is_platform_admin()));

create policy organizations_update on organizations
  for update to authenticated
  using ((select is_platform_admin()))
  with check ((select is_platform_admin()));

create policy organizations_delete on organizations
  for delete to authenticated
  using ((select is_platform_admin()));

-- organization_settings
create policy organization_settings_select on organization_settings
  for select to authenticated
  using ((select is_org_member(organization_id)));

create policy organization_settings_update on organization_settings
  for update to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

-- score_scale_ranges
create policy score_scale_ranges_select on score_scale_ranges
  for select to authenticated
  using ((select is_org_member(organization_id)));

create policy score_scale_ranges_insert on score_scale_ranges
  for insert to authenticated
  with check ((select is_org_admin(organization_id)));

create policy score_scale_ranges_update on score_scale_ranges
  for update to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

create policy score_scale_ranges_delete on score_scale_ranges
  for delete to authenticated
  using ((select is_org_admin(organization_id)));

-- profiles (names only, no PII; no authenticated write policy — D27/D37)
create policy profiles_select on profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select is_platform_admin())
    or exists (
      select 1
      from organization_memberships mine
      join organization_memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'ACTIVE'
        and theirs.user_id = profiles.id
        and theirs.status = 'ACTIVE'
    )
  );

-- profile_private (D27; no authenticated write policy)
create policy profile_private_select on profile_private
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select is_platform_admin())
    or exists (
      select 1
      from organization_memberships theirs
      where theirs.user_id = profile_private.user_id
        and theirs.status = 'ACTIVE'
        and (select is_org_admin(theirs.organization_id))
    )
  );

-- platform_admins (no authenticated write grants; service role only — D2/D24)
create policy platform_admins_select on platform_admins
  for select to authenticated
  using ((select is_platform_admin()));

-- organization_memberships (no authenticated write policy at all — D24)
create policy organization_memberships_select on organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select is_org_admin(organization_id))
  );

-- organization_registration_links (tokens are credentials, never readable by
-- members or anon; public validation via get_registration_link_public RPC, D37)
create policy organization_registration_links_select on organization_registration_links
  for select to authenticated
  using ((select is_org_admin(organization_id)));

create policy organization_registration_links_insert on organization_registration_links
  for insert to authenticated
  with check (
    (select is_org_admin(organization_id))
    and default_role <> 'ADMIN'
  );

create policy organization_registration_links_update on organization_registration_links
  for update to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

create policy organization_registration_links_delete on organization_registration_links
  for delete to authenticated
  using ((select is_org_admin(organization_id)));

-- groups
create policy groups_select on groups
  for select to authenticated
  using ((select is_org_member(organization_id)));

create policy groups_insert on groups
  for insert to authenticated
  with check ((select is_org_admin(organization_id)));

create policy groups_update on groups
  for update to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

create policy groups_delete on groups
  for delete to authenticated
  using ((select is_org_admin(organization_id)));

-- group_members (admin write policy + assert_active_member_of_org trigger; no UPDATE — D24)
create policy group_members_select on group_members
  for select to authenticated
  using (
    exists (
      select 1 from groups g
      where g.id = group_members.group_id
        and (select is_org_member(g.organization_id))
    )
  );

create policy group_members_insert on group_members
  for insert to authenticated
  with check (
    exists (
      select 1 from groups g
      where g.id = group_members.group_id
        and (select is_org_admin(g.organization_id))
    )
  );

create policy group_members_delete on group_members
  for delete to authenticated
  using (
    exists (
      select 1 from groups g
      where g.id = group_members.group_id
        and (select is_org_admin(g.organization_id))
    )
  );

create trigger assert_active_member_of_org
  before insert on group_members
  for each row execute function assert_active_member_of_org();
