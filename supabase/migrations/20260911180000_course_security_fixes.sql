-- Phase 3 review fixes: tenant-isolation and write-path holes found in review.

-- ---------------------------------------------------------------------------
-- C1: sync_offering_enrollments had NO authorization guard while being granted
-- to `authenticated`. Any logged-in user could call it for any offering id and
-- revive every CANCELLED enrollment in a tenant they have nothing to do with,
-- silently undoing an admin's revocation (D29). Verified exploitable before
-- this fix: an org B student reactivated three cancelled org A enrollments.
--
-- H2: the total_blocks refresh sat BELOW the `kind <> 'GROUP'` early return, so
-- OPEN (FREE) enrollments froze their denominator at enroll time forever and no
-- enrollment saw blocks added or removed later. Progress would never reach
-- 100%, or would exceed it. The refresh now lives in its own function that runs
-- for every offering of the course, and the content-block actions call it too.
-- ---------------------------------------------------------------------------
create function refresh_course_enrollment_totals(p_course uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int;
begin
  v_total := (select required_block_count(p_course));

  update course_enrollments
  set total_blocks = v_total
  where course_id = p_course
    and total_blocks is distinct from v_total;
end;
$$;

revoke execute on function refresh_course_enrollment_totals(uuid) from public, anon;
grant execute on function refresh_course_enrollment_totals(uuid) to authenticated;

create or replace function sync_offering_enrollments(p_offering uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering course_offerings%rowtype;
  v_course courses%rowtype;
  v_total_blocks int;
  v_affected int := 0;
  v_cancelled int;
begin
  select * into v_offering from course_offerings where id = p_offering;

  if v_offering.id is null then
    raise exception 'Offering not found' using errcode = 'no_data_found';
  end if;

  -- Authorisation first, against the org derived from the offering row (D25).
  if coalesce((select is_org_admin(v_offering.organization_id)), false) is not true then
    raise exception 'Only an organization admin can sync enrollments' using errcode = 'insufficient_privilege';
  end if;

  select * into v_course from courses where id = v_offering.course_id;

  -- Keep every enrollment's denominator current regardless of offering kind:
  -- OPEN offerings never reach the roster logic below.
  perform refresh_course_enrollment_totals(v_offering.course_id);

  if v_offering.kind <> 'GROUP' or v_offering.status <> 'ACTIVE' then
    return 0;
  end if;

  if v_course.status = 'ARCHIVED' then
    return 0;
  end if;

  v_total_blocks := (select required_block_count(v_offering.course_id));

  with roster as (
    select gm.user_id
    from group_members gm
    join organization_memberships om
      on om.user_id = gm.user_id
     and om.organization_id = v_offering.organization_id
    where gm.group_id = v_offering.group_id
      and om.status = 'ACTIVE'
      and om.role = 'STUDENT'
  ),
  upserted as (
    insert into course_enrollments (
      organization_id, course_id, offering_id, user_id, source, total_blocks
    )
    select
      v_offering.organization_id,
      v_offering.course_id,
      p_offering,
      roster.user_id,
      'GROUP_ASSIGNMENT',
      v_total_blocks
    from roster
    on conflict (offering_id, user_id) do update
      set status = 'ACTIVE',
          total_blocks = excluded.total_blocks
      where course_enrollments.status = 'CANCELLED'
    returning 1
  )
  select count(*) into v_affected from upserted;

  with departed as (
    update course_enrollments e
    set status = 'CANCELLED'
    where e.offering_id = p_offering
      and e.status = 'ACTIVE'
      and not exists (
        select 1
        from group_members gm
        join organization_memberships om
          on om.user_id = gm.user_id
         and om.organization_id = v_offering.organization_id
        where gm.group_id = v_offering.group_id
          and gm.user_id = e.user_id
          and om.status = 'ACTIVE'
          and om.role = 'STUDENT'
      )
      and not exists (
        select 1 from content_progress cp where cp.enrollment_id = e.id
      )
    returning 1
  )
  select count(*) into v_cancelled from departed;

  return v_affected + v_cancelled;
end;
$$;

revoke execute on function sync_offering_enrollments(uuid) from public, anon;
grant execute on function sync_offering_enrollments(uuid) to authenticated;

-- The Phase 2 group RPCs call the sync as their own definer (postgres), which
-- is not an org admin, so they need an explicit bypass rather than the guard.
create or replace function sync_group_offerings(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  if to_regclass('public.course_offerings') is null
     or to_regprocedure('public.sync_offering_enrollments(uuid)') is null then
    return;
  end if;

  -- Runs as the definer (postgres), which is not an org admin; the caller was
  -- already authorised by add_group_members / remove_group_member.
  for v_offering in
    execute format('select id from course_offerings where group_id = %L and status = ''ACTIVE''', p_group)
  loop
    execute format('select sync_offering_roster(%L)', v_offering);
  end loop;
end;
$$;

revoke execute on function sync_group_offerings(uuid) from public, anon, authenticated;

-- The unguarded body, for internal callers that have already checked
-- permission. Never granted to `authenticated`.
create function sync_offering_roster(p_offering uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering course_offerings%rowtype;
  v_course courses%rowtype;
  v_total_blocks int;
  v_affected int := 0;
  v_cancelled int;
begin
  select * into v_offering from course_offerings where id = p_offering;
  if v_offering.id is null then
    return 0;
  end if;

  select * into v_course from courses where id = v_offering.course_id;

  perform refresh_course_enrollment_totals(v_offering.course_id);

  if v_offering.kind <> 'GROUP' or v_offering.status <> 'ACTIVE' or v_course.status = 'ARCHIVED' then
    return 0;
  end if;

  v_total_blocks := (select required_block_count(v_offering.course_id));

  with roster as (
    select gm.user_id
    from group_members gm
    join organization_memberships om
      on om.user_id = gm.user_id
     and om.organization_id = v_offering.organization_id
    where gm.group_id = v_offering.group_id
      and om.status = 'ACTIVE'
      and om.role = 'STUDENT'
  ),
  upserted as (
    insert into course_enrollments (
      organization_id, course_id, offering_id, user_id, source, total_blocks
    )
    select v_offering.organization_id, v_offering.course_id, p_offering,
           roster.user_id, 'GROUP_ASSIGNMENT', v_total_blocks
    from roster
    on conflict (offering_id, user_id) do update
      set status = 'ACTIVE', total_blocks = excluded.total_blocks
      where course_enrollments.status = 'CANCELLED'
    returning 1
  )
  select count(*) into v_affected from upserted;

  with departed as (
    update course_enrollments e
    set status = 'CANCELLED'
    where e.offering_id = p_offering
      and e.status = 'ACTIVE'
      and not exists (
        select 1 from group_members gm
        join organization_memberships om
          on om.user_id = gm.user_id and om.organization_id = v_offering.organization_id
        where gm.group_id = v_offering.group_id and gm.user_id = e.user_id
          and om.status = 'ACTIVE' and om.role = 'STUDENT'
      )
      and not exists (select 1 from content_progress cp where cp.enrollment_id = e.id)
    returning 1
  )
  select count(*) into v_cancelled from departed;

  return v_affected + v_cancelled;
end;
$$;

revoke execute on function sync_offering_roster(uuid) from public, anon, authenticated;

-- Now that the roster body lives in its own function, the public entry point
-- delegates to it after authorising.
create or replace function sync_offering_enrollments(p_offering uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering course_offerings%rowtype;
begin
  select * into v_offering from course_offerings where id = p_offering;

  if v_offering.id is null then
    raise exception 'Offering not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_offering.organization_id)), false) is not true then
    raise exception 'Only an organization admin can sync enrollments' using errcode = 'insufficient_privilege';
  end if;

  return (select sync_offering_roster(p_offering));
end;
$$;

revoke execute on function sync_offering_enrollments(uuid) from public, anon;
grant execute on function sync_offering_enrollments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C2: `course_offerings.organization_id` was client-supplied and only checked
-- against itself, while the FK to `courses` does not constrain the org. Org B's
-- admin could attach an offering to an org A course and stamp it with org B, so
-- the sync would write org B enrollments against org A content — which makes
-- `student_can_view_course` true and hands org B students another tenant's
-- modules, lessons, block data and signed file URLs.
--
-- The org is now derived from the parent course and the client value ignored.
-- ---------------------------------------------------------------------------
create function set_offering_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from courses where id = new.course_id;

  if v_org is null then
    raise exception 'Course not found for offering' using errcode = 'no_data_found';
  end if;

  new.organization_id := v_org;

  -- A GROUP offering may only target a group of that same organization.
  if new.group_id is not null and not exists (
    select 1 from groups g where g.id = new.group_id and g.organization_id = v_org
  ) then
    raise exception 'Group belongs to a different organization' using errcode = 'invalid_parameter_value';
  end if;

  return new;
end;
$$;

revoke execute on function set_offering_organization() from public, anon, authenticated;

create trigger set_offering_organization
  before insert or update on course_offerings
  for each row execute function set_offering_organization();

-- ---------------------------------------------------------------------------
-- H3: `is_enrolled_in_course` ignored the offering's status, so cancelling an
-- offering revoked nothing: `can_view_block` refused the files while the course,
-- modules, lessons and block data stayed readable. The two now agree.
-- ---------------------------------------------------------------------------
create or replace function is_enrolled_in_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from course_enrollments e
      join course_offerings o on o.id = e.offering_id
      where e.course_id = p_course
        and e.user_id = auth.uid()
        and e.status <> 'CANCELLED'
        and o.status = 'ACTIVE'
        and (select is_org_member(e.organization_id))
    ),
    false
  );
$$;

revoke execute on function is_enrolled_in_course(uuid) from public, anon;
grant execute on function is_enrolled_in_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C3: the content tables carried `FOR ALL` write policies, so PostgREST let the
-- browser skip every guard the Server Actions enforce. A direct DELETE on
-- `modules` bypassed `assert_subtree_deletable` and cascaded into
-- `content_progress` (C10); a direct DELETE on `courses` bypassed the
-- DRAFT/no-enrollment rule that lived only in TypeScript.
--
-- Client DELETE is withdrawn from the tables whose deletion destroys history;
-- the guarded RPCs remain the only path.
-- ---------------------------------------------------------------------------
drop policy modules_write on modules;
drop policy lessons_write on lessons;
drop policy lesson_content_blocks_write on lesson_content_blocks;

create policy modules_insert on modules
  for insert to authenticated
  with check ((select can_edit_course(course_id)));

create policy modules_update on modules
  for update to authenticated
  using ((select can_edit_course(course_id)))
  with check ((select can_edit_course(course_id)));

create policy lessons_insert on lessons
  for insert to authenticated
  with check ((select can_edit_course((select course_id_of_module(module_id)))));

create policy lessons_update on lessons
  for update to authenticated
  using ((select can_edit_course((select course_id_of_module(module_id)))))
  with check ((select can_edit_course((select course_id_of_module(module_id)))));

create policy lesson_content_blocks_insert on lesson_content_blocks
  for insert to authenticated
  with check ((select can_edit_course((select course_id_of_lesson(lesson_id)))));

create policy lesson_content_blocks_update on lesson_content_blocks
  for update to authenticated
  using ((select can_edit_course((select course_id_of_lesson(lesson_id)))))
  with check ((select can_edit_course((select course_id_of_lesson(lesson_id)))));

-- H5: deleting a block cascades into `content_progress`, so it needs the same
-- guard modules and lessons already have. Returns the stored object path (if
-- any) so the caller can remove the file after the row is gone.
create function delete_content_block(p_block uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
  v_path text;
  v_has_progress boolean;
begin
  v_course := (select course_id_of_block(p_block));

  if v_course is null then
    raise exception 'Block not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  select exists (select 1 from content_progress where content_block_id = p_block)
  into v_has_progress;

  if v_has_progress then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  select data ->> 'path' into v_path from lesson_content_blocks where id = p_block;

  delete from lesson_content_blocks where id = p_block;

  perform refresh_course_enrollment_totals(v_course);

  return v_path;
end;
$$;

revoke execute on function delete_content_block(uuid) from public, anon;
grant execute on function delete_content_block(uuid) to authenticated;

-- C3(c): the DRAFT / no-enrollment rule for course deletion lived only in the
-- Server Action, so a direct DELETE removed a published course and cascaded
-- through its offerings into every enrollment.
drop policy courses_delete on courses;

create policy courses_delete on courses
  for delete to authenticated
  using (
    (select is_org_admin(organization_id))
    and status = 'DRAFT'
    and not exists (select 1 from course_enrollments e where e.course_id = courses.id)
  );
