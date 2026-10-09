-- B4: statistics per edition.
--
-- * `org_offering_stats(p_org, p_course)` — new, org admins only: one row per
--   edition (course, edition, group, enrolled, average progress, attempts,
--   pending grading).
-- * `professor_overview_stats()` — one row per edition the professor teaches
--   instead of one per course. The return type changes, so it is dropped and
--   re-created (never `create or replace` across signatures) and re-granted.
-- * `org_course_stats` is unchanged: its average progress is already the
--   average over every non-CANCELLED enrollment of the course, i.e. the
--   enrollment-weighted average of its editions, and its counts are sums.
--
-- "Pending grading" matches the grading queue everywhere: SUBMITTED or
-- AUTO_SUBMITTED, and a TASK only once its deadline has passed.

-- ---------------------------------------------------------------------------
-- org_offering_stats
-- ---------------------------------------------------------------------------
create function org_offering_stats(p_org uuid, p_course uuid default null)
returns table (
  offering_id uuid,
  offering_name text,
  offering_kind offering_kind,
  offering_status offering_status,
  course_id uuid,
  course_title text,
  group_id uuid,
  group_name text,
  enrolled_count bigint,
  avg_progress_percent numeric,
  attempts_count bigint,
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

  -- Qualified throughout: `offering_id`, `course_id` and `group_id` are both
  -- OUT parameters and table columns.
  return query
  with offering_rows as (
    select o.id, o.name, o.kind, o.status, o.course_id, o.group_id, o.created_at
    from course_offerings o
    where o.organization_id = p_org
      and (p_course is null or o.course_id = p_course)
  ),
  enrollment_stats as (
    select ce.offering_id, count(*) as enrolled, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.organization_id = p_org
      and ce.offering_id in (select r.id from offering_rows r)
      and ce.status <> 'CANCELLED'
    group by ce.offering_id
  ),
  attempt_stats as (
    select
      ae.offering_id,
      count(*) as attempts,
      count(*) filter (
        where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
          and (a.kind <> 'TASK' or now() >= a.available_until)
      ) as pending
    from assessment_attempts aa
    join assessments a on a.id = aa.assessment_id
    join course_enrollments ae on ae.id = aa.enrollment_id
    where aa.organization_id = p_org
      and ae.offering_id in (select r.id from offering_rows r)
    group by ae.offering_id
  )
  select
    r.id,
    r.name,
    r.kind,
    r.status,
    c.id,
    c.title,
    g.id,
    g.name,
    coalesce(es.enrolled, 0),
    round(coalesce(es.avg_progress, 0), 1),
    coalesce(ast.attempts, 0),
    coalesce(ast.pending, 0)
  from offering_rows r
  join courses c on c.id = r.course_id
  left join groups g on g.id = r.group_id
  left join enrollment_stats es on es.offering_id = r.id
  left join attempt_stats ast on ast.offering_id = r.id
  order by c.title, r.created_at, r.id;
end;
$$;

revoke execute on function org_offering_stats(uuid, uuid) from public, anon;
grant execute on function org_offering_stats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- professor_overview_stats: one row per edition the professor teaches.
-- ---------------------------------------------------------------------------
drop function if exists professor_overview_stats();

create function professor_overview_stats()
returns table (
  offering_id uuid,
  offering_name text,
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
  with my_offerings as (
    select op.offering_id
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
  enrollment_stats as (
    select ce.offering_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.offering_id in (select mo.offering_id from my_offerings mo)
      and ce.status <> 'CANCELLED'
    group by ce.offering_id
  ),
  attempt_stats as (
    select
      ae.offering_id,
      count(*) filter (where aa.status = 'IN_PROGRESS') as in_progress,
      count(*) filter (where aa.status = 'SUBMITTED') as submitted,
      count(*) filter (where aa.status = 'AUTO_SUBMITTED') as auto_submitted,
      count(*) filter (where aa.status = 'GRADED') as graded,
      count(*) filter (
        where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
          -- A TASK is only gradable after its deadline; match the grading queue.
          and (a.kind <> 'TASK' or now() >= a.available_until)
      ) as pending
    from assessment_attempts aa
    join assessments a on a.id = aa.assessment_id
    join course_enrollments ae on ae.id = aa.enrollment_id
    where ae.offering_id in (select mo.offering_id from my_offerings mo)
    group by ae.offering_id
  )
  select
    o.id,
    o.name,
    c.id,
    c.title,
    coalesce(es.n, 0),
    round(coalesce(es.avg_progress, 0), 1),
    coalesce(ast.in_progress, 0),
    coalesce(ast.submitted, 0),
    coalesce(ast.auto_submitted, 0),
    coalesce(ast.graded, 0),
    coalesce(ast.pending, 0)
  from my_offerings mo
  join course_offerings o on o.id = mo.offering_id
  join courses c on c.id = o.course_id
  left join enrollment_stats es on es.offering_id = o.id
  left join attempt_stats ast on ast.offering_id = o.id
  order by c.title, o.created_at, o.id;
end;
$$;

revoke execute on function professor_overview_stats() from public, anon;
grant execute on function professor_overview_stats() to authenticated;
