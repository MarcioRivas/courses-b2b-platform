-- Student "Cursos" single screen.
--
-- 1. my_enrollment_summaries gains the student's last activity and where to
--    resume (lesson of the most recently completed block + its module title),
--    so the screen can sort "Seguí donde dejaste" and deep link without N+1.
--    Columns are only ADDED (get-enrollment.ts maps the existing ones).
-- 2. list_available_free_courses: FREE courses of the caller's organization
--    they can actually enroll in (open + active edition, not already enrolled),
--    with the module count. SECURITY DEFINER because a student cannot read the
--    edition (course_offerings) of a course they are not enrolled in.

-- ---------------------------------------------------------------------------
-- 1. my_enrollment_summaries + activity / resume point
-- ---------------------------------------------------------------------------
drop function my_enrollment_summaries(uuid);

create function my_enrollment_summaries(p_enrollment uuid default null)
returns table (
  enrollment_id uuid,
  status enrollment_status,
  source enrollment_source,
  progress_percent numeric,
  completed_blocks integer,
  total_blocks integer,
  completed_at timestamptz,
  course_id uuid,
  course_title text,
  course_description text,
  course_status course_status,
  offering_name text,
  offering_status offering_status,
  ends_at timestamptz,
  offering_id uuid,
  last_activity_at timestamptz,
  resume_lesson_id uuid,
  resume_module_title text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    e.id,
    e.status,
    e.source,
    e.progress_percent,
    e.completed_blocks,
    e.total_blocks,
    e.completed_at,
    c.id,
    c.title,
    c.description,
    c.status,
    o.name,
    o.status,
    o.ends_at,
    o.id,
    coalesce(last.completed_at, e.started_at, e.enrolled_at),
    last.lesson_id,
    last.module_title
  from course_enrollments e
  join courses c on c.id = e.course_id
  join course_offerings o on o.id = e.offering_id
  -- Most recently completed block of this enrollment (content_progress is
  -- indexed by enrollment; bounded by the student's own enrollments).
  left join lateral (
    select cp.completed_at, l.id as lesson_id, m.title as module_title
    from content_progress cp
    join lesson_content_blocks b on b.id = cp.content_block_id
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where cp.enrollment_id = e.id
    order by cp.completed_at desc
    limit 1
  ) last on true
  where e.user_id = auth.uid()
    -- A revoked membership or a deactivated organization loses access to its
    -- enrollments immediately (D29); `is_org_member` covers both.
    and coalesce((select is_org_member(e.organization_id)), false)
    and (p_enrollment is null or e.id = p_enrollment)
  order by e.enrolled_at desc;
$$;

revoke execute on function my_enrollment_summaries(uuid) from public, anon;
grant execute on function my_enrollment_summaries(uuid) to authenticated;

-- The lateral above sorts one enrollment's progress by completion time.
create index content_progress_enrollment_completed_idx on content_progress (enrollment_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- 2. list_available_free_courses
-- ---------------------------------------------------------------------------

/**
 * PUBLISHED FREE courses of p_organization that the caller can enroll in right
 * now: an OPEN + ACTIVE edition that has not ended (the same edition
 * self_enroll_free_course picks), and no non-CANCELLED enrollment of the
 * caller in the course. A non-member of p_organization gets an empty set:
 * free courses never leak across organizations.
 */
create function list_available_free_courses(p_organization uuid)
returns table (course_id uuid, title text, description text, module_count int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.title, c.description,
         (select count(*)::int from modules m where m.offering_id = o.id)
  from courses c
  join course_offerings o
    on o.course_id = c.id
   and o.kind = 'OPEN'
   and o.status = 'ACTIVE'
   and (o.ends_at is null or o.ends_at > now())
  where c.organization_id = p_organization
    and coalesce((select is_org_member(p_organization)), false)
    and c.status = 'PUBLISHED'
    and c.access_type = 'FREE'
    and not exists (
      select 1 from course_enrollments e
      where e.course_id = c.id
        and e.user_id = auth.uid()
        and e.status <> 'CANCELLED'
    )
  order by c.title;
$$;

revoke execute on function list_available_free_courses(uuid) from public, anon;
grant execute on function list_available_free_courses(uuid) to authenticated;
