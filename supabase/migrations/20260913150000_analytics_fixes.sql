-- Phase 6 review fixes (code-reviewer-260913-phase-06-analytics.md).
--
-- H1: `assessment_score_distribution` bucketed on the raw `numeric(5,2)`
-- score against `int` ranges — any fractional percent (69.5, 79.99, ...)
-- matched no range and fell into a phantom "Sin rango" bucket. Bucket on
-- `floor(score_percent)` instead (both the join and the not-exists).
--
-- M3: CANCELLED enrollments (D29 flips a deactivated member's rows to
-- CANCELLED) were inflating "Con algún curso", per-course/per-org enrolled
-- counts and dragging average progress toward 0. Excluded from every count
-- below except the already-status-scoped `students_completed_course`.
--
-- L5: `org_professor_stats` listed INACTIVE professors while the cards above
-- it show only active counts. Filtered to ACTIVE membership.
--
-- Every function is `create or replace` with an identical signature, so no
-- `drop function` / re-grant-to-role dance is needed — but the
-- revoke/grant pair is still re-issued for each to guard against a
-- `pg_default_acl` regression re-granting anon on replace (Phase 1 lesson).

-- ---------------------------------------------------------------------------
-- org_overview_stats: exclude CANCELLED from students_with_enrollment.
-- ---------------------------------------------------------------------------
create or replace function org_overview_stats(p_org uuid)
returns table (
  students_total bigint,
  students_active bigint,
  students_with_enrollment bigint,
  students_completed_course bigint,
  professors_total bigint,
  professors_active bigint,
  admins_active bigint,
  courses_draft bigint,
  courses_published bigint,
  courses_archived bigint,
  attempts_in_progress bigint,
  attempts_submitted bigint,
  attempts_auto_submitted bigint,
  attempts_graded bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select is_org_admin(p_org)), false) is not true
    and coalesce((select is_platform_admin()), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with mem as (
    select role, status from organization_memberships where organization_id = p_org
  ),
  enr as (
    select user_id, status from course_enrollments where organization_id = p_org
  ),
  crs as (
    select status from courses where organization_id = p_org
  ),
  att as (
    select status from assessment_attempts where organization_id = p_org
  )
  select
    count(*) filter (where mem.role = 'STUDENT'),
    count(*) filter (where mem.role = 'STUDENT' and mem.status = 'ACTIVE'),
    (select count(distinct enr.user_id) from enr where enr.status <> 'CANCELLED'),
    (select count(distinct enr.user_id) from enr where enr.status = 'COMPLETED'),
    count(*) filter (where mem.role = 'PROFESSOR'),
    count(*) filter (where mem.role = 'PROFESSOR' and mem.status = 'ACTIVE'),
    count(*) filter (where mem.role = 'ADMIN' and mem.status = 'ACTIVE'),
    (select count(*) from crs where crs.status = 'DRAFT'),
    (select count(*) from crs where crs.status = 'PUBLISHED'),
    (select count(*) from crs where crs.status = 'ARCHIVED'),
    (select count(*) from att where att.status = 'IN_PROGRESS'),
    (select count(*) from att where att.status = 'SUBMITTED'),
    (select count(*) from att where att.status = 'AUTO_SUBMITTED'),
    (select count(*) from att where att.status = 'GRADED')
  from mem;
end;
$$;

revoke execute on function org_overview_stats(uuid) from public, anon;
grant execute on function org_overview_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- org_course_stats: exclude CANCELLED from enrolled_count/avg_progress.
-- ---------------------------------------------------------------------------
create or replace function org_course_stats(p_org uuid)
returns table (
  course_id uuid,
  course_title text,
  status course_status,
  offerings_count bigint,
  enrolled_count bigint,
  avg_progress_percent numeric,
  completion_rate numeric,
  last_activity timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select is_org_admin(p_org)), false) is not true
    and coalesce((select is_platform_admin()), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with course_rows as (
    select c.id, c.title, c.status
    from courses c
    where c.organization_id = p_org
  ),
  offering_counts as (
    select co.course_id, count(*) as n
    from course_offerings co
    where co.organization_id = p_org
    group by co.course_id
  ),
  enrollment_stats as (
    select
      ce.course_id,
      count(*) as enrolled,
      avg(ce.progress_percent) as avg_progress,
      count(*) filter (where ce.status = 'COMPLETED') as completed
    from course_enrollments ce
    where ce.organization_id = p_org
      and ce.status <> 'CANCELLED'
    group by ce.course_id
  ),
  activity as (
    select ce.course_id, max(cp.completed_at) as last_at
    from content_progress cp
    join course_enrollments ce on ce.id = cp.enrollment_id
    where ce.organization_id = p_org
    group by ce.course_id
  )
  select
    cr.id,
    cr.title,
    cr.status,
    coalesce(oc.n, 0),
    coalesce(es.enrolled, 0),
    round(coalesce(es.avg_progress, 0), 1),
    case
      when coalesce(es.enrolled, 0) = 0 then 0
      else round(es.completed::numeric / es.enrolled * 100, 1)
    end,
    act.last_at
  from course_rows cr
  left join offering_counts oc on oc.course_id = cr.id
  left join enrollment_stats es on es.course_id = cr.id
  left join activity act on act.course_id = cr.id
  order by cr.title;
end;
$$;

revoke execute on function org_course_stats(uuid) from public, anon;
grant execute on function org_course_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- org_professor_stats: exclude INACTIVE professor memberships (L5).
-- ---------------------------------------------------------------------------
create or replace function org_professor_stats(p_org uuid)
returns table (
  professor_user_id uuid,
  first_name text,
  last_name text,
  assigned_courses_count bigint,
  attempts_graded_count bigint,
  last_graded_at timestamptz,
  pending_grading_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    select cp.user_id, count(*) as n
    from course_professors cp
    join courses c on c.id = cp.course_id
    where c.organization_id = p_org
    group by cp.user_id
  ),
  graded as (
    select ag.graded_by as user_id, count(*) as n, max(ag.graded_at) as last_at
    from assessment_grades ag
    join assessment_attempts aa on aa.id = ag.attempt_id
    where aa.organization_id = p_org
    group by ag.graded_by
  ),
  pending as (
    select cp.user_id, count(distinct aa.id) as n
    from course_professors cp
    join assessments a on a.course_id = cp.course_id
    join assessment_attempts aa on aa.assessment_id = a.id
    where a.organization_id = p_org
      and aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
    group by cp.user_id
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
$$;

revoke execute on function org_professor_stats(uuid) from public, anon;
grant execute on function org_professor_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- assessment_score_distribution: bucket on floor(score_percent) (H1) so a
-- fractional score (69.5, 79.99, ...) still lands in the int-scale range it
-- belongs to instead of the "Sin rango" catch-all.
-- ---------------------------------------------------------------------------
create or replace function assessment_score_distribution(p_assessment uuid)
returns table (
  label text,
  bucket_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    and coalesce((select is_course_professor(v_course)), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with graded_attempts as (
    select aa.score_percent
    from assessment_attempts aa
    where aa.assessment_id = p_assessment
      and aa.organization_id = v_org
      and aa.status = 'GRADED'
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
$$;

revoke execute on function assessment_score_distribution(uuid) from public, anon;
grant execute on function assessment_score_distribution(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- platform_org_stats: exclude CANCELLED from enrollments_count/avg_progress.
-- ---------------------------------------------------------------------------
create or replace function platform_org_stats()
returns table (
  organization_id uuid,
  name text,
  status org_status,
  students_count bigint,
  professors_count bigint,
  courses_count bigint,
  enrollments_count bigint,
  attempts_count bigint,
  avg_progress_percent numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select is_platform_admin()), false) is not true then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  return query
  with mem_counts as (
    select
      om.organization_id,
      count(*) filter (where om.role = 'STUDENT') as students,
      count(*) filter (where om.role = 'PROFESSOR') as professors
    from organization_memberships om
    group by om.organization_id
  ),
  course_counts as (
    select c.organization_id, count(*) as n from courses c group by c.organization_id
  ),
  enrollment_stats as (
    select ce.organization_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.status <> 'CANCELLED'
    group by ce.organization_id
  ),
  attempt_counts as (
    select aa.organization_id, count(*) as n from assessment_attempts aa group by aa.organization_id
  )
  select
    o.id,
    o.name,
    o.status,
    coalesce(mc.students, 0),
    coalesce(mc.professors, 0),
    coalesce(cc.n, 0),
    coalesce(es.n, 0),
    coalesce(ac.n, 0),
    round(coalesce(es.avg_progress, 0), 1)
  from organizations o
  left join mem_counts mc on mc.organization_id = o.id
  left join course_counts cc on cc.organization_id = o.id
  left join enrollment_stats es on es.organization_id = o.id
  left join attempt_counts ac on ac.organization_id = o.id
  order by o.name;
end;
$$;

revoke execute on function platform_org_stats() from public, anon;
grant execute on function platform_org_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- professor_overview_stats: exclude CANCELLED from enrolled_count/avg_progress.
-- ---------------------------------------------------------------------------
create or replace function professor_overview_stats()
returns table (
  course_id uuid,
  course_title text,
  enrolled_count bigint,
  avg_progress_percent numeric,
  attempts_in_progress bigint,
  attempts_submitted bigint,
  attempts_auto_submitted bigint,
  attempts_graded bigint,
  pending_grading_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  with my_courses as (
    select cp.course_id
    from course_professors cp
    join courses c on c.id = cp.course_id
    where cp.user_id = auth.uid()
      and exists (
        select 1
        from organization_memberships om
        where om.organization_id = c.organization_id
          and om.user_id = auth.uid()
          and om.status = 'ACTIVE'
          and om.role = 'PROFESSOR'
      )
  ),
  enrollment_stats as (
    select ce.course_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.course_id in (select mc.course_id from my_courses mc)
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
      count(*) filter (where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')) as pending
    from assessments a
    join assessment_attempts aa on aa.assessment_id = a.id
    where a.course_id in (select mc.course_id from my_courses mc)
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
$$;

revoke execute on function professor_overview_stats() from public, anon;
grant execute on function professor_overview_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- L4: every `p_org` analytics CTE above filters `assessment_attempts` by
-- `organization_id` with no supporting index — add it before Phase 7 load.
-- ---------------------------------------------------------------------------
create index if not exists assessment_attempts_organization_id_idx
  on assessment_attempts (organization_id);
