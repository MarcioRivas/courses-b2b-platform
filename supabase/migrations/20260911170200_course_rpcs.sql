-- Phase 3 — Course lifecycle, enrollment sync and ordering RPCs.
-- All SECURITY DEFINER, locked search_path, revoked from public + anon (C2).

-- ---------------------------------------------------------------------------
-- required_block_count: denominator for enrollment progress.
-- ---------------------------------------------------------------------------
create function required_block_count(p_course uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from lesson_content_blocks b
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where m.course_id = p_course
    and b.is_required;
$$;

revoke execute on function required_block_count(uuid) from public, anon;
grant execute on function required_block_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_course: admin only. Refuses a skeleton course (§46).
-- ---------------------------------------------------------------------------
create function publish_course(p_course uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses%rowtype;
  v_complete boolean;
begin
  select * into v_course from courses where id = p_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_course.organization_id)), false) is not true then
    raise exception 'Only an organization admin can publish a course' using errcode = 'insufficient_privilege';
  end if;

  -- At least one module holding at least one lesson holding at least one block.
  select exists (
    select 1
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where m.course_id = p_course
  ) into v_complete;

  if not v_complete then
    raise exception 'COURSE_INCOMPLETE' using errcode = 'invalid_parameter_value';
  end if;

  update courses
  set status = 'PUBLISHED',
      published_at = coalesce(published_at, now()),
      archived_at = null
  where id = p_course;

  -- A FREE course is consumed through a single OPEN offering (D13).
  if v_course.access_type = 'FREE' then
    insert into course_offerings (course_id, organization_id, kind, name)
    values (p_course, v_course.organization_id, 'OPEN', v_course.title)
    on conflict do nothing;
  end if;

  perform log_audit(
    v_course.organization_id,
    'course.published',
    'course',
    p_course,
    jsonb_build_object('access_type', v_course.access_type)
  );
end;
$$;

revoke execute on function publish_course(uuid) from public, anon;
grant execute on function publish_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- archive_course: stops new enrollments; existing ones keep their history.
-- ---------------------------------------------------------------------------
create function archive_course(p_course uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses%rowtype;
begin
  select * into v_course from courses where id = p_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_course.organization_id)), false) is not true then
    raise exception 'Only an organization admin can archive a course' using errcode = 'insufficient_privilege';
  end if;

  update courses
  set status = 'ARCHIVED',
      archived_at = now()
  where id = p_course;

  perform log_audit(v_course.organization_id, 'course.archived', 'course', p_course, '{}'::jsonb);
end;
$$;

revoke execute on function archive_course(uuid) from public, anon;
grant execute on function archive_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_offering_enrollments: idempotent, re-runnable materialisation of a
-- GROUP offering's roster. Called by the Phase 2 group RPCs after a bulk
-- change and by offering create/activate — never by a per-row trigger (D34/F9).
-- ---------------------------------------------------------------------------
create function sync_offering_enrollments(p_offering uuid)
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

  select * into v_course from courses where id = v_offering.course_id;

  -- Only GROUP offerings have a roster to materialise; OPEN offerings are
  -- filled one student at a time by self_enroll_free_course.
  if v_offering.kind <> 'GROUP' or v_offering.status <> 'ACTIVE' then
    return 0;
  end if;

  -- An archived course accepts no new enrollments; existing rows are left
  -- untouched so history and progress survive.
  if v_course.status = 'ARCHIVED' then
    return 0;
  end if;

  v_total_blocks := (select required_block_count(v_offering.course_id));

  -- Insert the current roster. `do update` revives a previously CANCELLED
  -- enrollment rather than creating a second one, so a student re-added to the
  -- group gets their old progress back (D29).
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

  -- Keep the denominator current for everyone else too: blocks may have been
  -- added or removed since the last sync.
  update course_enrollments
  set total_blocks = v_total_blocks
  where offering_id = p_offering
    and total_blocks is distinct from v_total_blocks;

  -- Soft-cancel students who left the group, but only when they have no
  -- progress: cancelling someone mid-course would hide work they already did.
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

-- ---------------------------------------------------------------------------
-- self_enroll_free_course: the only student-initiated write onto enrollments.
-- ---------------------------------------------------------------------------
create function self_enroll_free_course(p_course uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course courses%rowtype;
  v_offering course_offerings%rowtype;
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_course from courses where id = p_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'no_data_found';
  end if;

  if v_course.status <> 'PUBLISHED' or v_course.access_type <> 'FREE' then
    raise exception 'Course is not open for self-enrollment' using errcode = 'invalid_parameter_value';
  end if;

  -- is_org_member also requires the organization to be ACTIVE (D29).
  if coalesce((select is_org_member(v_course.organization_id)), false) is not true then
    raise exception 'You are not an active member of this organization' using errcode = 'insufficient_privilege';
  end if;

  select * into v_offering
  from course_offerings
  where course_id = p_course and kind = 'OPEN' and status = 'ACTIVE';

  if v_offering.id is null then
    raise exception 'Course has no open offering' using errcode = 'no_data_found';
  end if;

  insert into course_enrollments (
    organization_id, course_id, offering_id, user_id, source, total_blocks
  )
  values (
    v_course.organization_id,
    p_course,
    v_offering.id,
    auth.uid(),
    'FREE_COURSE',
    (select required_block_count(p_course))
  )
  on conflict (offering_id, user_id) do update
    set status = 'ACTIVE'
    where course_enrollments.status = 'CANCELLED'
  returning id into v_enrollment_id;

  -- `do update ... where` matched nothing: the caller is already enrolled.
  if v_enrollment_id is null then
    select id into v_enrollment_id
    from course_enrollments
    where offering_id = v_offering.id and user_id = auth.uid();
  end if;

  return v_enrollment_id;
end;
$$;

revoke execute on function self_enroll_free_course(uuid) from public, anon;
grant execute on function self_enroll_free_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reordering. One statement per call; the DEFERRABLE unique constraints let
-- positions collide until commit.
-- ---------------------------------------------------------------------------
create function reorder_modules(p_course uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select can_edit_course(p_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  -- Reject a partial list: renumbering a subset would leave duplicate or
  -- missing positions once the constraint is checked at commit.
  if (select count(*) from modules where course_id = p_course)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every module of the course'
      using errcode = 'invalid_parameter_value';
  end if;

  update modules m
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where m.id = ordered.id
    and m.course_id = p_course;
end;
$$;

revoke execute on function reorder_modules(uuid, uuid[]) from public, anon;
grant execute on function reorder_modules(uuid, uuid[]) to authenticated;

create function reorder_lessons(p_module uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select can_edit_course((select course_id_of_module(p_module)))), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from lessons where module_id = p_module)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every lesson of the module'
      using errcode = 'invalid_parameter_value';
  end if;

  update lessons l
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where l.id = ordered.id
    and l.module_id = p_module;
end;
$$;

revoke execute on function reorder_lessons(uuid, uuid[]) from public, anon;
grant execute on function reorder_lessons(uuid, uuid[]) to authenticated;

create function reorder_content_blocks(p_lesson uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select can_edit_course((select course_id_of_lesson(p_lesson)))), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from lesson_content_blocks where lesson_id = p_lesson)
     <> coalesce(array_length(p_ordered_ids, 1), 0) then
    raise exception 'Ordered id list must contain every block of the lesson'
      using errcode = 'invalid_parameter_value';
  end if;

  update lesson_content_blocks b
  set position = ordered.ord
  from unnest(p_ordered_ids) with ordinality as ordered(id, ord)
  where b.id = ordered.id
    and b.lesson_id = p_lesson;
end;
$$;

revoke execute on function reorder_content_blocks(uuid, uuid[]) from public, anon;
grant execute on function reorder_content_blocks(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Guarded deletes. A CASCADE from a module or lesson would reach
-- content_progress and, from Phase 5, attempts and grades (C10). Refuse
-- instead and let the UI offer archiving.
-- ---------------------------------------------------------------------------
create function assert_subtree_deletable(p_course uuid, p_module uuid, p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status course_status;
  v_has_active_enrollments boolean;
  v_has_progress boolean;
  v_has_attempts boolean;
begin
  select status into v_status from courses where id = p_course;

  select exists (
    select 1 from course_enrollments
    where course_id = p_course and status = 'ACTIVE'
  ) into v_has_active_enrollments;

  if v_status = 'PUBLISHED' and v_has_active_enrollments then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  select exists (
    select 1
    from content_progress cp
    join lesson_content_blocks b on b.id = cp.content_block_id
    join lessons l on l.id = b.lesson_id
    where (p_module is not null and l.module_id = p_module)
       or (p_lesson is not null and b.lesson_id = p_lesson)
  ) into v_has_progress;

  if v_has_progress then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  -- Phase 5 adds assessment_attempts; until then there is nothing to check.
  -- to_regclass takes a bare relation name, which is correct here — unlike
  -- to_regproc, which cannot parse a function signature.
  if to_regclass('public.assessment_attempts') is not null then
    execute format(
      'select exists (
         select 1
         from assessment_attempts at
         join assessments a on a.id = at.assessment_id
         join modules m on m.id = a.module_id
         where m.course_id = %L and (%L::uuid is null or m.id = %L::uuid)
       )',
      p_course, p_module, p_module
    ) into v_has_attempts;

    if v_has_attempts then
      raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
    end if;
  end if;
end;
$$;

revoke execute on function assert_subtree_deletable(uuid, uuid, uuid) from public, anon, authenticated;

create function delete_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_module(p_module));

  if v_course is null then
    raise exception 'Module not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_course, p_module, null);

  delete from modules where id = p_module;
end;
$$;

revoke execute on function delete_module(uuid) from public, anon;
grant execute on function delete_module(uuid) to authenticated;

create function delete_lesson(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_lesson(p_lesson));

  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_course, null, p_lesson);

  delete from lessons where id = p_lesson;
end;
$$;

revoke execute on function delete_lesson(uuid) from public, anon;
grant execute on function delete_lesson(uuid) to authenticated;
