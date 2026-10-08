-- B1: professors per edition.
-- `course_professors` is replaced by `offering_professors`. The helpers
-- `is_course_professor` and `can_edit_course` are DROPPED (not redefined) so no
-- caller can keep silently using the course-level rule: every policy and
-- function that used them is rewritten below, and a catalog test asserts no
-- policy or function body references the old names.
--
-- Content (modules, lessons, blocks, assessments) is still per course in this
-- increment, so `can_edit_course_content` (any edition's professor) is the
-- temporary content authority; B2 replaces it with per-edition checks.

-- ---------------------------------------------------------------------------
-- 1. offering_professors
-- ---------------------------------------------------------------------------
create table offering_professors (
  offering_id uuid not null references course_offerings (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  assigned_by uuid references profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (offering_id, user_id)
);

create index offering_professors_user_id_idx on offering_professors (user_id);

alter table offering_professors enable row level security;
alter table offering_professors force row level security;

-- Membership trigger: the offering_professors branch resolves the org through
-- the offering. (Replaces the course_professors branch.)
create or replace function assert_active_member_of_org()
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
  elsif tg_table_name = 'offering_professors' then
    select organization_id into v_org from course_offerings where id = new.offering_id;
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

create trigger assert_active_member_of_org
  before insert on offering_professors
  for each row execute function assert_active_member_of_org();

-- ---------------------------------------------------------------------------
-- 2. Helpers (mirror every guard of the old is_course_professor: ACTIVE org
-- (D29), ACTIVE PROFESSOR membership, is_org_member).
-- ---------------------------------------------------------------------------
create function is_offering_professor(p_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from offering_professors op
      join course_offerings o on o.id = op.offering_id
      where op.offering_id = p_offering
        and op.user_id = auth.uid()
        and exists (
          select 1
          from organization_memberships om
          where om.organization_id = o.organization_id
            and om.user_id = auth.uid()
            and om.status = 'ACTIVE'
            and om.role = 'PROFESSOR'
        )
        and exists (
          select 1 from organizations g
          where g.id = o.organization_id and g.status = 'ACTIVE'
        )
        and (select is_org_member(o.organization_id))
    ),
    false
  );
$$;

revoke execute on function is_offering_professor(uuid) from public, anon;
grant execute on function is_offering_professor(uuid) to authenticated;

create function is_professor_of_any_edition(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from offering_professors op
      join course_offerings o on o.id = op.offering_id
      where o.course_id = p_course
        and op.user_id = auth.uid()
        and exists (
          select 1
          from organization_memberships om
          where om.organization_id = o.organization_id
            and om.user_id = auth.uid()
            and om.status = 'ACTIVE'
            and om.role = 'PROFESSOR'
        )
        and exists (
          select 1 from organizations g
          where g.id = o.organization_id and g.status = 'ACTIVE'
        )
        and (select is_org_member(o.organization_id))
    ),
    false
  );
$$;

revoke execute on function is_professor_of_any_edition(uuid) from public, anon;
grant execute on function is_professor_of_any_edition(uuid) to authenticated;

-- Content authority (TEMPORARY, B2 drops it). `alter ... rename` keeps the OID,
-- so every existing policy follows the new name; the body is then replaced so
-- the old course-level rule is gone.
alter function can_edit_course(uuid) rename to can_edit_course_content;

create or replace function can_edit_course_content(p_course uuid)
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
    or (select is_professor_of_any_edition(p_course)),
    false
  );
$$;

revoke execute on function can_edit_course_content(uuid) from public, anon;
grant execute on function can_edit_course_content(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. offering_professors policies (admin writes; a professor only sees staff of
-- editions they teach).
-- ---------------------------------------------------------------------------
create policy offering_professors_select on offering_professors
  for select to authenticated
  using (
    (select is_offering_professor(offering_id))
    or exists (
      select 1 from course_offerings o
      where o.id = offering_professors.offering_id
        and (select is_org_admin(o.organization_id))
    )
  );

create policy offering_professors_insert on offering_professors
  for insert to authenticated
  with check (
    exists (
      select 1 from course_offerings o
      where o.id = offering_professors.offering_id
        and (select is_org_admin(o.organization_id))
    )
  );

create policy offering_professors_delete on offering_professors
  for delete to authenticated
  using (
    exists (
      select 1 from course_offerings o
      where o.id = offering_professors.offering_id
        and (select is_org_admin(o.organization_id))
    )
  );


-- ---------------------------------------------------------------------------
-- 4. Data: every course-level assignment becomes one row per edition of that
-- course, only for professors whose membership is still ACTIVE PROFESSOR.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select cp.course_id, cp.user_id
    from course_professors cp
    join courses c on c.id = cp.course_id
    where not exists (
      select 1 from organization_memberships om
      where om.organization_id = c.organization_id
        and om.user_id = cp.user_id
        and om.status = 'ACTIVE'
        and om.role = 'PROFESSOR'
    )
  loop
    raise notice 'offering_professors: skipped inactive professor % of course %', r.user_id, r.course_id;
  end loop;
end
$$;

do $$
declare
  r record;
begin
  for r in
    select cp.course_id, cp.user_id
    from course_professors cp
    where not exists (select 1 from course_offerings o where o.course_id = cp.course_id)
  loop
    raise notice 'offering_professors: dropped assignment of % (course % has no editions)', r.user_id, r.course_id;
  end loop;
end
$$;

insert into offering_professors (offering_id, user_id, assigned_by, assigned_at)
select o.id, cp.user_id, cp.assigned_by, cp.assigned_at
from course_professors cp
join courses c on c.id = cp.course_id
join course_offerings o on o.course_id = cp.course_id
where exists (
  select 1 from organization_memberships om
  where om.organization_id = c.organization_id
    and om.user_id = cp.user_id
    and om.status = 'ACTIVE'
    and om.role = 'PROFESSOR'
);

-- ---------------------------------------------------------------------------
-- 5. Policies that used is_course_professor, rewritten.
-- ---------------------------------------------------------------------------
drop policy courses_select on courses;
create policy courses_select on courses
  for select to authenticated
  using (
    (select is_org_admin(courses.organization_id))
    or (select is_professor_of_any_edition(courses.id))
    or (select student_can_view_course(courses.id))
  );

drop policy course_offerings_select on course_offerings;
create policy course_offerings_select on course_offerings
  for select to authenticated
  using (
    (select is_org_admin(course_offerings.organization_id))
    or (select is_offering_professor(course_offerings.id))
    or exists (
      select 1 from course_enrollments e
      where e.offering_id = course_offerings.id
        and e.user_id = (select auth.uid())
        and e.status <> 'CANCELLED'
    )
  );

drop policy offering_module_schedules_select on offering_module_schedules;
create policy offering_module_schedules_select on offering_module_schedules
  for select to authenticated
  using (
    exists (
      select 1 from course_offerings o
      where o.id = offering_module_schedules.offering_id
        and (
          (select is_org_admin(o.organization_id))
          or (select is_offering_professor(o.id))
          or exists (
            select 1 from course_enrollments e
            where e.offering_id = o.id
              and e.user_id = (select auth.uid())
              and e.status <> 'CANCELLED'
          )
        )
    )
  );

drop policy course_enrollments_select on course_enrollments;
create policy course_enrollments_select on course_enrollments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select is_org_member(course_enrollments.organization_id)))
    or (select is_org_admin(course_enrollments.organization_id))
    or (select is_offering_professor(course_enrollments.offering_id))
  );

drop policy content_progress_select on content_progress;
create policy content_progress_select on content_progress
  for select to authenticated
  using (
    exists (
      select 1 from course_enrollments e
      where e.id = content_progress.enrollment_id
        and (
          (e.user_id = (select auth.uid()) and (select is_org_member(e.organization_id)))
          or (select is_org_admin(e.organization_id))
          or (select is_offering_professor(e.offering_id))
        )
    )
  );

drop policy assessment_attempts_select on assessment_attempts;
create policy assessment_attempts_select on assessment_attempts
  for select to authenticated
  using (
    (select is_org_admin(assessment_attempts.organization_id))
    or exists (
      select 1 from course_enrollments e
      where e.id = assessment_attempts.enrollment_id
        and (select is_offering_professor(e.offering_id))
    )
  );

drop policy assessment_feedback_select on assessment_feedback;
create policy assessment_feedback_select on assessment_feedback
  for select to authenticated
  using (
    exists (
      select 1 from assessment_attempts t
      where t.id = assessment_feedback.attempt_id
        and (
          (select is_org_admin(t.organization_id))
          or exists (
            select 1 from course_enrollments e
            where e.id = t.enrollment_id
              and (select is_offering_professor(e.offering_id))
          )
        )
    )
  );

drop policy assessment_grades_select on assessment_grades;
create policy assessment_grades_select on assessment_grades
  for select to authenticated
  using (
    exists (
      select 1 from assessment_attempts t
      where t.id = assessment_grades.attempt_id
        and (
          (select is_org_admin(t.organization_id))
          or exists (
            select 1 from course_enrollments e
            where e.id = t.enrollment_id
              and (select is_offering_professor(e.offering_id))
          )
        )
    )
  );

drop policy question_banks_all on question_banks;
create policy question_banks_all on question_banks
  for all to authenticated
  using (
    (select is_org_member(question_banks.organization_id))
    and (
      (select is_org_admin(question_banks.organization_id))
      or (course_id is not null and (select is_professor_of_any_edition(question_banks.course_id)))
      or (course_id is null and (select user_org_role(question_banks.organization_id)) = 'PROFESSOR')
    )
  )
  with check (
    (select is_org_member(question_banks.organization_id))
    and (
      (select is_org_admin(question_banks.organization_id))
      or (course_id is not null and (select is_professor_of_any_edition(question_banks.course_id)))
      or (course_id is null and (select user_org_role(question_banks.organization_id)) = 'PROFESSOR')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Drop the old table and helper. The helper still has no dependent policy
-- here; any function body still naming it is rewritten in section 7.
-- ---------------------------------------------------------------------------
drop table course_professors;

-- ---------------------------------------------------------------------------
-- 7. Functions that used the old helpers (bodies rewritten).
-- ---------------------------------------------------------------------------
create or replace function assessment_score_distribution(p_assessment uuid)
 RETURNS TABLE(label text, bucket_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_course uuid;
begin
  select organization_id, course_id into v_org, v_course
  from assessments
  where id = p_assessment;

  if v_org is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if coalesce((select is_org_admin(v_org)), false) is not true
    and coalesce((select is_professor_of_any_edition(v_course)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with graded_attempts as (
    select aa.score_percent
    from assessment_attempts aa
    join course_enrollments e on e.id = aa.enrollment_id
    where aa.assessment_id = p_assessment
      and aa.organization_id = v_org
      and aa.status = 'GRADED'
      -- A professor only counts the editions they teach.
      and ((select is_org_admin(v_org)) or (select is_offering_professor(e.offering_id)))
  ),
  ranges as (
    select r.id, r.label, r.min_score, r.max_score
    from score_scale_ranges r
    where r.organization_id = v_org
  ),
  bucketed as (
    select r.id as range_id, count(*) as n
    from graded_attempts ga
    join ranges r on floor(ga.score_percent) between r.min_score and r.max_score
    group by r.id
  ),
  unmatched as (
    select count(*) as n
    from graded_attempts ga
    where not exists (
      select 1 from ranges r where floor(ga.score_percent) between r.min_score and r.max_score
    )
  )
  select t.label, t.bucket_count
  from (
    select r.min_score as ord, r.label, coalesce(b.n, 0)::bigint as bucket_count
    from ranges r
    left join bucketed b on b.range_id = r.id
    union all
    select 101, 'Sin rango', u.n
    from unmatched u
    where u.n > 0
  ) t
  order by t.ord;
end;
$function$
;

create or replace function can_edit_question_bank(p_bank uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select
        (select is_org_member(b.organization_id))
        and (
          (select is_org_admin(b.organization_id))
          or (b.course_id is not null and (select is_professor_of_any_edition(b.course_id)))
          or (b.course_id is null and (select user_org_role(b.organization_id)) = 'PROFESSOR')
        )
      from question_banks b
      where b.id = p_bank
    ),
    false
  );
$function$
;

create or replace function can_grade_attempt(p_attempt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select
        (select is_org_admin(t.organization_id))
        or (select is_offering_professor(e.offering_id))
      from assessment_attempts t
      join course_enrollments e on e.id = t.enrollment_id
      where t.id = p_attempt
    ),
    false
  );
$function$
;

create or replace function can_view_attempt(p_attempt uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select
        (t.user_id = auth.uid() and (select is_org_member(t.organization_id)))
        or (select is_org_admin(t.organization_id))
        or (select is_offering_professor(e.offering_id))
      from assessment_attempts t
      join course_enrollments e on e.id = t.enrollment_id
      where t.id = p_attempt
    ),
    false
  );
$function$
;

create or replace function can_view_block(p_block uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    (select (select can_edit_course_content(bc.course_id)) from block_course bc)
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
$function$
;

create or replace function can_view_enrollment(p_enrollment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select
        (e.user_id = auth.uid() and (select is_org_member(e.organization_id)))
        or (select is_org_admin(e.organization_id))
        or (select is_offering_professor(e.offering_id))
      from course_enrollments e
      where e.id = p_enrollment
    ),
    false
  );
$function$
;

create or replace function can_write_course_file(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_folders text[];
  v_org uuid;
  v_course uuid;
begin
  v_folders := storage.foldername(p_name);

  if array_length(v_folders, 1) is null or array_length(v_folders, 1) < 2 then
    return false;
  end if;

  -- A malformed path is a denial, not an error: these are attacker-controlled.
  begin
    v_org := v_folders[1]::uuid;
    v_course := v_folders[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return coalesce(
    (
      select c.organization_id = v_org and (select can_edit_course_content(c.id))
      from courses c
      where c.id = v_course
    ),
    false
  );
end;
$function$
;

create or replace function delete_assessment(p_assessment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course_content(v_assessment.course_id)), false) is not true then
    raise exception 'Not allowed to delete this assessment' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from assessment_attempts where assessment_id = p_assessment) then
    raise exception 'CONFLICT_HAS_ATTEMPTS' using errcode = 'restrict_violation';
  end if;

  if exists (select 1 from lesson_content_blocks where assessment_id = p_assessment) then
    raise exception 'CONFLICT_HAS_BLOCKS' using errcode = 'restrict_violation';
  end if;

  delete from assessments where id = p_assessment;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.deleted',
    'assessment',
    p_assessment,
    jsonb_build_object('title', v_assessment.title)
  );
end;
$function$
;

create or replace function delete_content_block(p_block uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
  v_path text;
  v_has_progress boolean;
begin
  v_course := (select course_id_of_block(p_block));

  if v_course is null then
    raise exception 'Block not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course_content(v_course)), false) is not true then
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
$function$
;

create or replace function delete_lesson(p_lesson uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_lesson(p_lesson));

  if v_course is null then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course_content(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_course, null, p_lesson);

  delete from lessons where id = p_lesson;
end;
$function$
;

create or replace function delete_module(p_module uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_module(p_module));

  if v_course is null then
    raise exception 'Module not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course_content(v_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

  perform assert_subtree_deletable(v_course, p_module, null);

  delete from modules where id = p_module;
end;
$function$
;

create or replace function extend_assessment_window(p_assessment uuid, p_new_until timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
  v_count int;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce(
       (select is_org_admin(v_assessment.organization_id))
       or (select is_professor_of_any_edition(v_assessment.course_id)),
       false
     ) is not true then
    raise exception 'Not allowed to extend this assessment' using errcode = 'insufficient_privilege';
  end if;

  if p_new_until is null
     or (v_assessment.available_until is not null and p_new_until <= v_assessment.available_until) then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  update assessments set available_until = p_new_until where id = p_assessment;

  with bumped as (
    update assessment_attempts
    set availability_until = p_new_until,
        effective_end_at = least(
          case when duration_seconds is not null
            then started_at + make_interval(secs => duration_seconds)
          end,
          p_new_until
        )
    where assessment_id = p_assessment
      and status = 'IN_PROGRESS'
    returning 1
  )
  select count(*)::int into v_count from bumped;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.window_extended',
    'assessment',
    p_assessment,
    jsonb_build_object('new_until', p_new_until, 'attempts_updated', v_count)
  );

  return v_count;
end;
$function$
;

create or replace function org_professor_stats(p_org uuid)
 RETURNS TABLE(professor_user_id uuid, first_name text, last_name text, assigned_courses_count bigint, attempts_graded_count bigint, last_graded_at timestamp with time zone, pending_grading_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce((select is_org_admin(p_org)), false) is not true
    and coalesce((select is_platform_admin()), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with profs as (
    select om.user_id, p.first_name, p.last_name
    from organization_memberships om
    join profiles p on p.id = om.user_id
    where om.organization_id = p_org and om.role = 'PROFESSOR' and om.status = 'ACTIVE'
  ),
  assigned as (
    select op.user_id, count(distinct o.course_id) as n
    from offering_professors op
    join course_offerings o on o.id = op.offering_id
    where o.organization_id = p_org
    group by op.user_id
  ),
  graded as (
    select ag.graded_by as user_id, count(*) as n, max(ag.graded_at) as last_at
    from assessment_grades ag
    join assessment_attempts aa on aa.id = ag.attempt_id
    where aa.organization_id = p_org
    group by ag.graded_by
  ),
  pending as (
    select op.user_id, count(distinct aa.id) as n
    from offering_professors op
    join course_enrollments e on e.offering_id = op.offering_id
    join assessment_attempts aa on aa.enrollment_id = e.id
    where e.organization_id = p_org
      and aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
    group by op.user_id
  )
  select
    profs.user_id,
    profs.first_name,
    profs.last_name,
    coalesce(assigned.n, 0),
    coalesce(graded.n, 0),
    graded.last_at,
    coalesce(pending.n, 0)
  from profs
  left join assigned on assigned.user_id = profs.user_id
  left join graded on graded.user_id = profs.user_id
  left join pending on pending.user_id = profs.user_id
  order by profs.last_name, profs.first_name;
end;
$function$
;

create or replace function professor_overview_stats()
 RETURNS TABLE(course_id uuid, course_title text, enrolled_count bigint, avg_progress_percent numeric, attempts_in_progress bigint, attempts_submitted bigint, attempts_auto_submitted bigint, attempts_graded bigint, pending_grading_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  with my_offerings as (
    select op.offering_id, o.course_id
    from offering_professors op
    join course_offerings o on o.id = op.offering_id
    join courses c on c.id = o.course_id
    where op.user_id = auth.uid()
      and exists (
        select 1
        from organization_memberships om
        where om.organization_id = c.organization_id
          and om.user_id = auth.uid()
          and om.status = 'ACTIVE'
          and om.role = 'PROFESSOR'
      )
  ),
  my_courses as (
    select distinct mo.course_id from my_offerings mo
  ),
  enrollment_stats as (
    select ce.course_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.offering_id in (select mo.offering_id from my_offerings mo)
      and ce.status <> 'CANCELLED'
    group by ce.course_id
  ),
  attempt_stats as (
    select
      a.course_id,
      count(*) filter (where aa.status = 'IN_PROGRESS') as in_progress,
      count(*) filter (where aa.status = 'SUBMITTED') as submitted,
      count(*) filter (where aa.status = 'AUTO_SUBMITTED') as auto_submitted,
      count(*) filter (where aa.status = 'GRADED') as graded,
      count(*) filter (
        where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
          -- A TASK is only gradable after its deadline; match the grading queue.
          and (a.kind <> 'TASK' or now() >= a.available_until)
      ) as pending
    from assessments a
    join assessment_attempts aa on aa.assessment_id = a.id
    join course_enrollments ae on ae.id = aa.enrollment_id
    where ae.offering_id in (select mo.offering_id from my_offerings mo)
    group by a.course_id
  )
  select
    c.id,
    c.title,
    coalesce(es.n, 0),
    round(coalesce(es.avg_progress, 0), 1),
    coalesce(ast.in_progress, 0),
    coalesce(ast.submitted, 0),
    coalesce(ast.auto_submitted, 0),
    coalesce(ast.graded, 0),
    coalesce(ast.pending, 0)
  from my_courses mc
  join courses c on c.id = mc.course_id
  left join enrollment_stats es on es.course_id = c.id
  left join attempt_stats ast on ast.course_id = c.id
  order by c.title;
end;
$function$
;

create or replace function reorder_content_blocks(p_lesson uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
  v_org uuid;
begin
  v_course := (select course_id_of_lesson(p_lesson));

  if coalesce((select can_edit_course_content(v_course)), false) is not true then
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

  select organization_id into v_org from courses where id = v_course;
  perform log_audit(v_org, 'content_block.reordered', 'lesson', p_lesson, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$
;

create or replace function reorder_lessons(p_module uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
  v_org uuid;
begin
  v_course := (select course_id_of_module(p_module));

  if coalesce((select can_edit_course_content(v_course)), false) is not true then
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

  select organization_id into v_org from courses where id = v_course;
  perform log_audit(v_org, 'lesson.reordered', 'module', p_module, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$
;

create or replace function reorder_modules(p_course uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
begin
  if coalesce((select can_edit_course_content(p_course)), false) is not true then
    raise exception 'Not allowed to edit this course' using errcode = 'insufficient_privilege';
  end if;

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

  select organization_id into v_org from courses where id = p_course;
  perform log_audit(v_org, 'module.reordered', 'course', p_course, jsonb_build_object('orderedIds', p_ordered_ids));
end;
$function$
;

create or replace function save_video_checkpoints(p_block uuid, p_checkpoints jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_block lesson_content_blocks%rowtype;
  v_course uuid;
  v_org uuid;
  v_cp jsonb;
  v_q jsonb;
  v_o jsonb;
  v_cp_id uuid;
  v_q_id uuid;
  v_o_id uuid;
  v_q_count int;
  v_o_count int;
  v_correct int;
  v_min int;
  v_q_pos int;
  v_o_pos int;
begin
  select * into v_block from lesson_content_blocks where id = p_block;
  v_course := (select course_id_of_block(p_block));

  if v_block.id is null or coalesce((select can_edit_course_content(v_course)), false) is not true then
    raise exception 'Not allowed to edit this block' using errcode = 'insufficient_privilege';
  end if;

  if v_block.type <> 'YOUTUBE_VIDEO' then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  select c.organization_id into v_org from courses c where c.id = v_course;

  -- Validate the whole payload before writing anything.
  if jsonb_typeof(coalesce(p_checkpoints, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_checkpoints) > 20
     or (select count(distinct (x ->> 'atSeconds')) from jsonb_array_elements(p_checkpoints) x)
        <> jsonb_array_length(p_checkpoints) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  -- Each id may appear once per level: a duplicated id would silently merge
  -- two items (e.g. leave a question without its correct option).
  if (select count(*) - count(distinct x ->> 'id') from jsonb_array_elements(p_checkpoints) x where x ? 'id') > 0
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q
       where q ? 'id' group by q ->> 'id' having count(*) > 1
     )
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q,
                     jsonb_array_elements(q -> 'options') o
       where o ? 'id' group by o ->> 'id' having count(*) > 1
     ) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    v_q_count := coalesce(jsonb_array_length(v_cp -> 'questions'), 0);
    v_min := (v_cp ->> 'minCorrect')::int;

    if (v_cp ->> 'atSeconds')::int not between 1 and 43200
       or v_q_count not between 1 and 5
       or v_min is null or v_min not between 1 and v_q_count
       or (v_cp ? 'id' and not exists (
             select 1 from video_checkpoints vc where vc.id = (v_cp ->> 'id')::uuid and vc.block_id = p_block)) then
      raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
    end if;

    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_o_count := coalesce(jsonb_array_length(v_q -> 'options'), 0);
      select count(*) filter (where (o ->> 'isCorrect')::boolean) into v_correct
      from jsonb_array_elements(v_q -> 'options') o;

      if char_length(trim(coalesce(v_q ->> 'prompt', ''))) not between 1 and 1000
         or v_o_count not between 2 and 6
         or v_correct <> 1
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where char_length(trim(coalesce(o ->> 'label', ''))) not between 1 and 300
         )
         or (v_q ? 'id' and (not (v_cp ? 'id') or not exists (
               select 1 from video_checkpoint_questions q
               where q.id = (v_q ->> 'id')::uuid and q.checkpoint_id = (v_cp ->> 'id')::uuid)))
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where o ? 'id' and (not (v_q ? 'id') or not exists (
             select 1 from video_checkpoint_options vo
             where vo.id = (o ->> 'id')::uuid and vo.question_id = (v_q ->> 'id')::uuid))
         ) then
        raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
      end if;
    end loop;
  end loop;

  -- Checkpoints no longer present go away (with their progress and stats).
  delete from video_checkpoints vc
  where vc.block_id = p_block
    and vc.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(p_checkpoints) x where x ? 'id'
    );

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    if v_cp ? 'id' then
      v_cp_id := (v_cp ->> 'id')::uuid;
      update video_checkpoints
      set at_seconds = (v_cp ->> 'atSeconds')::int,
          min_correct = (v_cp ->> 'minCorrect')::int,
          updated_at = now()
      where id = v_cp_id;
    else
      insert into video_checkpoints (organization_id, block_id, at_seconds, min_correct)
      values (v_org, p_block, (v_cp ->> 'atSeconds')::int, (v_cp ->> 'minCorrect')::int)
      returning id into v_cp_id;
    end if;

    delete from video_checkpoint_questions q
    where q.checkpoint_id = v_cp_id
      and q.id not in (
        select (x ->> 'id')::uuid from jsonb_array_elements(v_cp -> 'questions') x where x ? 'id'
      );

    v_q_pos := 0;
    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_q_pos := v_q_pos + 1;
      if v_q ? 'id' then
        v_q_id := (v_q ->> 'id')::uuid;
        update video_checkpoint_questions
        set prompt = trim(v_q ->> 'prompt'), position = v_q_pos
        where id = v_q_id;
      else
        insert into video_checkpoint_questions (checkpoint_id, prompt, position)
        values (v_cp_id, trim(v_q ->> 'prompt'), v_q_pos)
        returning id into v_q_id;
      end if;

      delete from video_checkpoint_options vo
      where vo.question_id = v_q_id
        and vo.id not in (
          select (x ->> 'id')::uuid from jsonb_array_elements(v_q -> 'options') x where x ? 'id'
        );

      v_o_pos := 0;
      for v_o in select * from jsonb_array_elements(v_q -> 'options') loop
        v_o_pos := v_o_pos + 1;
        if v_o ? 'id' then
          update video_checkpoint_options
          set label = trim(v_o ->> 'label'),
              is_correct = coalesce((v_o ->> 'isCorrect')::boolean, false),
              position = v_o_pos
          where id = (v_o ->> 'id')::uuid;
        else
          insert into video_checkpoint_options (question_id, label, is_correct, position)
          values (v_q_id, trim(v_o ->> 'label'), coalesce((v_o ->> 'isCorrect')::boolean, false), v_o_pos);
        end if;
      end loop;
    end loop;
  end loop;

  perform log_audit(
    v_org,
    'video_checkpoints.saved',
    'content_block',
    p_block,
    jsonb_build_object('count', jsonb_array_length(p_checkpoints))
  );
end;
$function$
;

create or replace function set_assessment_questions(p_assessment uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment assessments%rowtype;
  v_count int;
  v_valid_count int;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course_content(v_assessment.course_id)), false) is not true then
    raise exception 'Not allowed to edit this assessment' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  if v_count > 0 then
    if exists (
      select 1
      from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
      where x.question_id is null or x.position is null or x.points is null or x.points <= 0
    ) then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    if (
      select count(distinct x.position) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count
    or (
      select count(distinct x.question_id) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    select count(*) into v_valid_count
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    join questions q on q.id = x.question_id
    where q.is_active is true
      and coalesce((select can_edit_question_bank(q.question_bank_id)), false) is true;

    if v_valid_count <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  delete from assessment_questions where assessment_id = p_assessment;

  if v_count > 0 then
    insert into assessment_questions (assessment_id, question_id, position, points)
    select p_assessment, x.question_id, x.position, x.points
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric);
  end if;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.questions_set',
    'assessment',
    p_assessment,
    jsonb_build_object('count', v_count)
  );
end;
$function$
;

create or replace function video_checkpoint_stats(p_block uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_block(p_block));

  if v_course is null or coalesce((select can_edit_course_content(v_course)), false) is not true then
    raise exception 'Not allowed to read these statistics' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'enrolledCount', (
      select count(*) from course_enrollments e where e.course_id = v_course and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
    ),
    'checkpoints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vc.id,
          'atSeconds', vc.at_seconds,
          'minCorrect', vc.min_correct,
          'reached', (
            select count(distinct a.enrollment_id) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id
          ),
          'passed', (
            select count(*) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'totalAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id
          ),
          'failedAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and not a.passed
          ),
          'firstTryAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and a.attempt_number = 1
          ),
          'firstTryPassed', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where a.checkpoint_id = vc.id and a.attempt_number = 1 and a.passed
          ),
          'avgAttemptsToPass', (
            select round(avg(p.attempts), 1) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'questions', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', q.id,
                'prompt', q.prompt,
                'answers', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id
                ),
                'wrong', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id and not aa.is_correct
                ),
                'unanswered', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                  where aa.question_id = q.id and aa.option_id is null
                ),
                'options', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'id', o.id,
                      'label', o.label,
                      'isCorrect', o.is_correct,
                      'chosen', (
                        select count(*) from video_checkpoint_attempt_answers aa
                        join video_checkpoint_attempts a on a.id = aa.attempt_id
                        join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED' and ((select is_org_admin(e.organization_id)) or (select is_offering_professor(e.offering_id)))
                        where aa.option_id = o.id
                      )
                    )
                    order by o.position
                  ), '[]'::jsonb)
                  from video_checkpoint_options o
                  where o.question_id = q.id
                )
              )
              order by q.position
            ), '[]'::jsonb)
            from video_checkpoint_questions q
            where q.checkpoint_id = vc.id
          )
        )
        order by vc.at_seconds
      )
      from video_checkpoints vc
      where vc.block_id = p_block
    ), '[]'::jsonb)
  );
end;
$function$
;

-- Old helper: no policy or function body references it any more.
drop function is_course_professor(uuid);

-- ---------------------------------------------------------------------------
-- 8. search_assignable_professors: admin-only picker search. Org derived from
-- the offering; input escaped; at most 3 rows; already-assigned excluded.
-- ---------------------------------------------------------------------------
create function search_assignable_professors(p_offering uuid, p_q text)
returns table (user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_q text := btrim(coalesce(p_q, ''));
  v_pattern text;
begin
  select organization_id into v_org from course_offerings where id = p_offering;

  if v_org is null or coalesce((select is_org_admin(v_org)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_q) < 2 then
    return;
  end if;

  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, (p.first_name || ' ' || p.last_name), pp.email::text
  from organization_memberships om
  join profiles p on p.id = om.user_id
  join profile_private pp on pp.user_id = om.user_id
  where om.organization_id = v_org
    and om.role = 'PROFESSOR'
    and om.status = 'ACTIVE'
    and not exists (
      select 1 from offering_professors op
      where op.offering_id = p_offering and op.user_id = om.user_id
    )
    and (
      (p.first_name || ' ' || p.last_name) ilike v_pattern
      or pp.email::text ilike v_pattern
    )
  order by p.last_name, p.first_name
  limit 3;
end;
$$;

revoke execute on function search_assignable_professors(uuid, text) from public, anon;
grant execute on function search_assignable_professors(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Edition identity is frozen: course, org and kind never change, so an
-- edition's staff and enrollments can't be re-pointed at another course.
-- ---------------------------------------------------------------------------
create function freeze_offering_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.course_id is distinct from old.course_id
     or new.organization_id is distinct from old.organization_id
     or new.kind is distinct from old.kind then
    raise exception 'course_offerings.course_id, organization_id and kind are immutable'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

revoke execute on function freeze_offering_identity() from public, anon, authenticated;

create trigger freeze_offering_identity
  before update on course_offerings
  for each row execute function freeze_offering_identity();
