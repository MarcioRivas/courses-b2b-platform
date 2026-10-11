-- Student transcript (escolaridad) for staff. Every RPC is gated by
-- can_staff_view_enrollment (org admin of the enrollment's org, or a professor
-- of its edition). Unlike can_view_enrollment it does NOT admit the enrolled
-- student: these RPCs expose staff-only data (D24/F7 — students only see
-- scores once GRADED, through the my_* RPCs, which stay locked to auth.uid()).

-- ---------------------------------------------------------------------------
-- 0. Staff-only gate. Internal: only called from the SECURITY DEFINER RPCs
--    below, so no role gets EXECUTE on it directly.
-- ---------------------------------------------------------------------------
create function can_staff_view_enrollment(p_enrollment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        (select is_org_admin(e.organization_id))
        or (select is_offering_professor(e.offering_id))
      from course_enrollments e
      where e.id = p_enrollment
    ),
    false
  );
$$;

revoke execute on function can_staff_view_enrollment(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. One row per enrollment of p_user the caller may view. Rows the caller
--    cannot view are simply absent (no existence oracle).
-- ---------------------------------------------------------------------------
create function staff_student_enrollments(p_user uuid)
returns table (
  enrollment_id uuid,
  offering_id uuid,
  course_id uuid,
  course_title text,
  offering_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  enrollment_status enrollment_status,
  enrolled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  progress_percent numeric,
  completed_blocks int,
  total_blocks int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    e.id, e.offering_id, e.course_id, c.title, o.name, o.starts_at, o.ends_at,
    e.status, e.enrolled_at, e.started_at, e.completed_at,
    e.progress_percent, e.completed_blocks, e.total_blocks
  from course_enrollments e
  join course_offerings o on o.id = e.offering_id
  join courses c on c.id = e.course_id
  where e.user_id = p_user
    and (select can_staff_view_enrollment(e.id))
  order by e.enrolled_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 2. Published assessments of the enrollment's edition with the latest attempt
--    (same shape as list_my_attempts, plus the latest attempt's dates).
-- ---------------------------------------------------------------------------
create function staff_enrollment_assessments(p_enrollment uuid)
returns table (
  assessment_id uuid,
  title text,
  kind assessment_kind,
  max_attempts integer,
  available_until timestamptz,
  attempts_used integer,
  last_attempt_id uuid,
  last_status attempt_status,
  score_percent numeric,
  score_label text,
  passed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  if coalesce((select can_staff_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  select e.offering_id into v_offering from course_enrollments e where e.id = p_enrollment;

  return query
  with latest as (
    select distinct on (t.assessment_id)
      t.assessment_id, t.id, t.status, t.score_percent, t.score_label, t.passed
    from assessment_attempts t
    where t.enrollment_id = p_enrollment
    order by t.assessment_id, t.attempt_number desc
  ),
  counts as (
    select t.assessment_id, count(*)::int as used
    from assessment_attempts t
    where t.enrollment_id = p_enrollment
    group by t.assessment_id
  )
  select
    a.id, a.title, a.kind, a.max_attempts, a.available_until,
    coalesce(c.used, 0),
    l.id,
    l.status,
    case when l.status = 'GRADED' then l.score_percent end,
    case when l.status = 'GRADED' then l.score_label end,
    case when l.status = 'GRADED' then l.passed end
  from assessments a
  left join latest l on l.assessment_id = a.id
  left join counts c on c.assessment_id = a.id
  where a.offering_id = v_offering
    and a.status = 'PUBLISHED'
  order by a.kind, a.title;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Activity timeline, newest first. A module is completed when ALL its
--    required blocks have content_progress rows; its date is the max of them.
-- ---------------------------------------------------------------------------
create function staff_enrollment_activity(p_enrollment uuid)
returns table (
  kind text,
  occurred_at timestamptz,
  module_title text,
  lesson_title text,
  item_title text,
  score_label text,
  passed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  if coalesce((select can_staff_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  select e.offering_id into v_offering from course_enrollments e where e.id = p_enrollment;

  return query
  with module_done as (
    select m.id, m.title, max(cp.completed_at) as done_at
    from modules m
    join lessons l on l.module_id = m.id
    join lesson_content_blocks b on b.lesson_id = l.id and b.is_required
    left join content_progress cp
      on cp.content_block_id = b.id and cp.enrollment_id = p_enrollment
    where m.offering_id = v_offering
    group by m.id, m.title
    having count(*) = count(cp.id)
  )
  select 'MODULE_COMPLETED'::text, d.done_at, d.title, null::text, null::text, null::text, null::boolean
  from module_done d
  union all
  select 'BLOCK_COMPLETED', cp.completed_at, m.title, l.title,
    coalesce(a.title, nullif(b.data ->> 'title', ''), b.type::text), null, null
  from content_progress cp
  join lesson_content_blocks b on b.id = cp.content_block_id
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  left join assessments a on a.id = b.assessment_id
  where cp.enrollment_id = p_enrollment
  union all
  select 'ATTEMPT_SUBMITTED', t.submitted_at, null, null, a.title, null, null
  from assessment_attempts t
  join assessments a on a.id = t.assessment_id
  where t.enrollment_id = p_enrollment and t.submitted_at is not null
  union all
  select 'ATTEMPT_GRADED', t.graded_at, null, null, a.title, t.score_label, t.passed
  from assessment_attempts t
  join assessments a on a.id = t.assessment_id
  where t.enrollment_id = p_enrollment and t.status = 'GRADED' and t.graded_at is not null
  order by 2 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pending items: required blocks without progress, plus published
--    assessments with no passing graded attempt.
-- ---------------------------------------------------------------------------
create function staff_enrollment_pending(p_enrollment uuid)
returns table (
  kind text,
  module_title text,
  lesson_title text,
  item_title text,
  item_kind text,
  module_position int,
  lesson_position int,
  block_position int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
begin
  if coalesce((select can_staff_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  select e.offering_id into v_offering from course_enrollments e where e.id = p_enrollment;

  return query
  select 'BLOCK'::text, m.title, l.title,
    coalesce(a.title, nullif(b.data ->> 'title', ''), b.type::text),
    b.type::text, m.position, l.position, b.position
  from modules m
  join lessons l on l.module_id = m.id
  join lesson_content_blocks b on b.lesson_id = l.id and b.is_required
  left join assessments a on a.id = b.assessment_id
  where m.offering_id = v_offering
    and not exists (
      select 1 from content_progress cp
      where cp.enrollment_id = p_enrollment and cp.content_block_id = b.id
    )
  union all
  select 'ASSESSMENT', null, null, a.title, a.kind::text, null, null, null
  from assessments a
  where a.offering_id = v_offering
    and a.status = 'PUBLISHED'
    and not exists (
      select 1 from assessment_attempts t
      where t.enrollment_id = p_enrollment
        and t.assessment_id = a.id
        and t.status = 'GRADED' and t.passed is true
    )
  order by 1, 6 nulls last, 7 nulls last, 8 nulls last, 4;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'staff_student_enrollments(uuid)',
    'staff_enrollment_assessments(uuid)',
    'staff_enrollment_activity(uuid)',
    'staff_enrollment_pending(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
