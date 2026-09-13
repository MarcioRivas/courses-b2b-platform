-- Phase 3 — Course access helpers + RLS policies
-- Every helper: STABLE SECURITY DEFINER, locked search_path, EXECUTE revoked
-- from public AND anon (Supabase grants anon by default — C2), boolean results
-- coalesced so a NULL can never read as "allowed" (C1).

-- ---------------------------------------------------------------------------
-- Parent-chain helpers. Policies on lessons/blocks/dependencies need the owning
-- course; these keep those policies readable and are the only place the walk
-- is written.
-- ---------------------------------------------------------------------------
create function course_id_of_module(p_module uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select course_id from modules where id = p_module;
$$;

revoke execute on function course_id_of_module(uuid) from public, anon;
grant execute on function course_id_of_module(uuid) to authenticated;

create function course_id_of_lesson(p_lesson uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.course_id
  from lessons l
  join modules m on m.id = l.module_id
  where l.id = p_lesson;
$$;

revoke execute on function course_id_of_lesson(uuid) from public, anon;
grant execute on function course_id_of_lesson(uuid) to authenticated;

create function course_id_of_block(p_block uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.course_id
  from lesson_content_blocks b
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where b.id = p_block;
$$;

revoke execute on function course_id_of_block(uuid) from public, anon;
grant execute on function course_id_of_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- is_course_professor: replaces the Phase 1 stub that always returned false.
-- ---------------------------------------------------------------------------
create or replace function is_course_professor(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from course_professors cp
      join courses c on c.id = cp.course_id
      where cp.course_id = p_course
        and cp.user_id = auth.uid()
        -- A professor removed from the org (or whose org was deactivated)
        -- loses course access immediately (D29).
        and exists (
          select 1
          from organization_memberships om
          where om.organization_id = c.organization_id
            and om.user_id = auth.uid()
            and om.status = 'ACTIVE'
            and om.role = 'PROFESSOR'
        )
        and exists (
          select 1 from organizations o
          where o.id = c.organization_id and o.status = 'ACTIVE'
        )
    ),
    false
  );
$$;

revoke execute on function is_course_professor(uuid) from public, anon;
grant execute on function is_course_professor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- can_edit_course: the single authority for content authoring (D22/D34).
-- Admins may edit any course in their org; professors only assigned courses.
-- Never re-derive this rule in TypeScript.
-- ---------------------------------------------------------------------------
create function can_edit_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select (select is_org_admin(c.organization_id))
      from courses c
      where c.id = p_course
    )
    or (select is_course_professor(p_course)),
    false
  );
$$;

revoke execute on function can_edit_course(uuid) from public, anon;
grant execute on function can_edit_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Student-facing visibility.
-- ---------------------------------------------------------------------------
create function is_enrolled_in_course(p_course uuid)
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
      where e.course_id = p_course
        and e.user_id = auth.uid()
        and e.status <> 'CANCELLED'
        and (select is_org_member(e.organization_id))
    ),
    false
  );
$$;

revoke execute on function is_enrolled_in_course(uuid) from public, anon;
grant execute on function is_enrolled_in_course(uuid) to authenticated;

/**
 * A student may see a course only while it is PUBLISHED: DRAFT and ARCHIVED
 * rows never reach them. FREE courses are visible to any ACTIVE member of the
 * owning org; PRIVATE courses require an enrollment.
 */
create function student_can_view_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select c.status = 'PUBLISHED'
        and (
          (c.access_type = 'FREE' and (select is_org_member(c.organization_id)))
          or (select is_enrolled_in_course(p_course))
        )
      from courses c
      where c.id = p_course
    ),
    false
  );
$$;

revoke execute on function student_can_view_course(uuid) from public, anon;
grant execute on function student_can_view_course(uuid) to authenticated;

/**
 * Gate for minting a signed URL over a stored file (D26). An editor always
 * passes; a student must be able to see the course AND be inside the module's
 * availability window for at least one of their ACTIVE offerings. A module with
 * no schedule row for that offering is always available.
 */
create function can_view_block(p_block uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with block_course as (
    select
      m.id as module_id,
      m.course_id
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where b.id = p_block
  )
  select coalesce(
    (select (select can_edit_course(bc.course_id)) from block_course bc)
    or (
      select
        (select student_can_view_course(bc.course_id))
        and exists (
          select 1
          from course_enrollments e
          join course_offerings o on o.id = e.offering_id
          left join offering_module_schedules s
            on s.offering_id = o.id and s.module_id = bc.module_id
          where e.course_id = bc.course_id
            and e.user_id = auth.uid()
            and e.status <> 'CANCELLED'
            and o.status = 'ACTIVE'
            and (s.available_from is null or s.available_from <= now())
            and (s.available_until is null or s.available_until > now())
        )
      from block_course bc
    ),
    false
  );
$$;

revoke execute on function can_view_block(uuid) from public, anon;
grant execute on function can_view_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- courses: professors get no write policy at all — they author content, not
-- the course row (phase-03 step 2).
create policy courses_select on courses
  for select to authenticated
  using (
    (select is_org_admin(organization_id))
    or (select is_course_professor(id))
    or (select student_can_view_course(id))
  );

create policy courses_insert on courses
  for insert to authenticated
  with check ((select is_org_admin(organization_id)));

create policy courses_update on courses
  for update to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

create policy courses_delete on courses
  for delete to authenticated
  using ((select is_org_admin(organization_id)));

-- course_professors: admin-writable, backed by the membership trigger (D24).
create policy course_professors_select on course_professors
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select can_edit_course(course_id))
  );

create policy course_professors_insert on course_professors
  for insert to authenticated
  with check (
    exists (
      select 1 from courses c
      where c.id = course_professors.course_id
        and (select is_org_admin(c.organization_id))
    )
  );

create policy course_professors_delete on course_professors
  for delete to authenticated
  using (
    exists (
      select 1 from courses c
      where c.id = course_professors.course_id
        and (select is_org_admin(c.organization_id))
    )
  );

-- modules / lessons / blocks / dependencies: read follows course visibility,
-- write follows can_edit_course.
create policy modules_select on modules
  for select to authenticated
  using (
    (select can_edit_course(course_id))
    or (select student_can_view_course(course_id))
  );

create policy modules_write on modules
  for all to authenticated
  using ((select can_edit_course(course_id)))
  with check ((select can_edit_course(course_id)));

create policy module_dependencies_select on module_dependencies
  for select to authenticated
  using (
    (select can_edit_course((select course_id_of_module(module_id))))
    or (select student_can_view_course((select course_id_of_module(module_id))))
  );

create policy module_dependencies_write on module_dependencies
  for all to authenticated
  using ((select can_edit_course((select course_id_of_module(module_id)))))
  with check ((select can_edit_course((select course_id_of_module(module_id)))));

create policy lessons_select on lessons
  for select to authenticated
  using (
    (select can_edit_course((select course_id_of_module(module_id))))
    or (select student_can_view_course((select course_id_of_module(module_id))))
  );

create policy lessons_write on lessons
  for all to authenticated
  using ((select can_edit_course((select course_id_of_module(module_id)))))
  with check ((select can_edit_course((select course_id_of_module(module_id)))));

create policy lesson_content_blocks_select on lesson_content_blocks
  for select to authenticated
  using (
    (select can_edit_course((select course_id_of_lesson(lesson_id))))
    or (select student_can_view_course((select course_id_of_lesson(lesson_id))))
  );

create policy lesson_content_blocks_write on lesson_content_blocks
  for all to authenticated
  using ((select can_edit_course((select course_id_of_lesson(lesson_id)))))
  with check ((select can_edit_course((select course_id_of_lesson(lesson_id)))));

-- course_offerings: staff read all of their org's offerings; a student reads
-- only offerings they are enrolled in. Writes are admin-only.
create policy course_offerings_select on course_offerings
  for select to authenticated
  using (
    (select is_org_admin(organization_id))
    or (select is_course_professor(course_id))
    or exists (
      select 1 from course_enrollments e
      where e.offering_id = course_offerings.id
        and e.user_id = (select auth.uid())
        and e.status <> 'CANCELLED'
    )
  );

create policy course_offerings_write on course_offerings
  for all to authenticated
  using ((select is_org_admin(organization_id)))
  with check ((select is_org_admin(organization_id)));

create policy offering_module_schedules_select on offering_module_schedules
  for select to authenticated
  using (
    exists (
      select 1 from course_offerings o
      where o.id = offering_module_schedules.offering_id
        and (
          (select is_org_admin(o.organization_id))
          or (select is_course_professor(o.course_id))
          or exists (
            select 1 from course_enrollments e
            where e.offering_id = o.id
              and e.user_id = (select auth.uid())
              and e.status <> 'CANCELLED'
          )
        )
    )
  );

create policy offering_module_schedules_write on offering_module_schedules
  for all to authenticated
  using (
    exists (
      select 1 from course_offerings o
      where o.id = offering_module_schedules.offering_id
        and (select is_org_admin(o.organization_id))
    )
  )
  with check (
    exists (
      select 1 from course_offerings o
      where o.id = offering_module_schedules.offering_id
        and (select is_org_admin(o.organization_id))
    )
  );

-- course_enrollments: read-only for everyone; every write is an RPC (D24).
create policy course_enrollments_select on course_enrollments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select is_org_member(organization_id)))
    or (select is_org_admin(organization_id))
    or (select is_course_professor(course_id))
  );

-- content_progress: read-only for everyone; written by complete_content_block
-- and finalize_attempt in Phases 4/5 (D24, D33).
create policy content_progress_select on content_progress
  for select to authenticated
  using (
    exists (
      select 1 from course_enrollments e
      where e.id = content_progress.enrollment_id
        and (
          (e.user_id = (select auth.uid()) and (select is_org_member(e.organization_id)))
          or (select is_org_admin(e.organization_id))
          or (select is_course_professor(e.course_id))
        )
    )
  );
