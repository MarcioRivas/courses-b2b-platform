-- Phase 4 review fixes (code-reviewer 260911-1739, findings M1–M4).

-- ---------------------------------------------------------------------------
-- M4: `refresh_course_enrollment_totals` was SECURITY DEFINER, granted to
-- `authenticated`, and had no authorization check whatsoever — any signed-in
-- user could rewrite `total_blocks` on any tenant's enrollments for any course
-- id they guessed. It also made a second writer of a cache Phase 4 declares
-- single-writer, leaving `progress_percent` inconsistent with
-- `completed_blocks`/`total_blocks` until the student's next toggle.
--
-- Every real caller is a SECURITY DEFINER function in this schema
-- (`sync_offering_enrollments`, `archive_course`, the content-block paths),
-- which reaches it as the owner regardless of grants. Nothing in the
-- application calls it over PostgREST. So the grant is simply withdrawn
-- rather than papered over with a guard.
-- ---------------------------------------------------------------------------
revoke execute on function refresh_course_enrollment_totals(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- M1 + M2: `recalc_enrollment_progress`.
--
-- M1 — lost update. The function counted, then updated, holding no lock. Under
-- READ COMMITTED two concurrent completions (two tabs, or Phase 5's
-- `finalize_attempt` racing a manual toggle) both counted before either
-- committed; the second UPDATE blocked on the row lock and then wrote its stale
-- count. `content_progress` held two rows while the cache claimed one, and a
-- finished enrollment could sit at 99% without ever flipping to COMPLETED.
-- The row is now locked FOR UPDATE before counting, which serialises the pair.
--
-- M2 — erased history. `completed_at` was cleared whenever the enrollment was
-- not currently at 100%. That is right when the student un-ticks a block, but
-- it also fired when a professor added a required block to a course someone had
-- already finished: the timestamp recording that they once completed it was
-- destroyed by somebody else's edit. A growing denominator now leaves
-- `completed_at` alone (the status still returns to ACTIVE — there is genuinely
-- new work to do).
-- ---------------------------------------------------------------------------
create or replace function recalc_enrollment_progress(p_enrollment uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
  v_previous_total int;
  v_total int;
  v_completed int;
  v_percent numeric(5, 2);
begin
  -- FOR UPDATE, not a plain select: this is the serialisation point between
  -- two concurrent writers of the same enrollment's cache (M1).
  select course_id, total_blocks
  into v_course, v_previous_total
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_course is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  v_total := (select required_block_count(v_course));

  -- Counted through the block, not from `content_progress` alone: a block that
  -- was later made optional (or moved to another course) must drop out of the
  -- numerator too, or an enrollment could report more completions than the
  -- denominator allows.
  select count(*)
  into v_completed
  from content_progress cp
  join lesson_content_blocks b on b.id = cp.content_block_id
  join lessons l on l.id = b.lesson_id
  join modules m on m.id = l.module_id
  where cp.enrollment_id = p_enrollment
    and m.course_id = v_course
    and b.is_required;

  v_percent := case
    when v_total = 0 then 0
    else round((v_completed::numeric * 100) / v_total, 2)
  end;

  update course_enrollments
  set
    total_blocks = v_total,
    completed_blocks = v_completed,
    progress_percent = v_percent,
    started_at = case
      when started_at is null and v_completed > 0 then now()
      else started_at
    end,
    -- A CANCELLED enrollment keeps its status: reviving it is the roster
    -- sync's job, never a side effect of recomputing a number.
    status = case
      when status = 'CANCELLED' then status
      when v_total > 0 and v_completed >= v_total then 'COMPLETED'::enrollment_status
      else 'ACTIVE'::enrollment_status
    end,
    completed_at = case
      when v_total > 0 and v_completed >= v_total then coalesce(completed_at, now())
      -- The course grew under them: they are no longer at 100%, but they did
      -- finish what the course was, and that fact is history, not cache (M2).
      when v_total > v_previous_total then completed_at
      else null
    end
  where id = p_enrollment;
end;
$$;

revoke execute on function recalc_enrollment_progress(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- M3: the student's own enrollments, readable even once the course closes.
--
-- `student_can_view_course` requires the course to be PUBLISHED with an ACTIVE
-- offering, so the moment a course is ARCHIVED or its offering CANCELLED the
-- `courses` embed came back NULL: the dashboard silently dropped the card (a
-- COMPLETED enrollment simply vanished from the student's history) and the
-- course page rendered a bare 404. `module_unlock_state` had a precise Spanish
-- explanation ready for exactly these cases and the student could never see it,
-- which is the opposite of §53.
--
-- This function reads the caller's OWN enrollments only, and never depends on
-- the course still being visible. It exposes nothing a student could not
-- already see while the course was open: their own row, plus the title of a
-- course they are demonstrably enrolled in.
-- ---------------------------------------------------------------------------
create function my_enrollment_summaries(p_enrollment uuid default null)
returns table (
  enrollment_id uuid,
  status enrollment_status,
  source enrollment_source,
  progress_percent numeric,
  completed_blocks int,
  total_blocks int,
  completed_at timestamptz,
  course_id uuid,
  course_title text,
  course_description text,
  course_status course_status,
  offering_name text,
  offering_status offering_status,
  ends_at timestamptz
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
    o.ends_at
  from course_enrollments e
  join courses c on c.id = e.course_id
  join course_offerings o on o.id = e.offering_id
  where e.user_id = auth.uid()
    -- A revoked membership or a deactivated organization loses access to its
    -- enrollments immediately (D29); `is_org_member` covers both.
    and coalesce((select is_org_member(e.organization_id)), false)
    and (p_enrollment is null or e.id = p_enrollment)
  order by e.enrolled_at desc;
$$;

revoke execute on function my_enrollment_summaries(uuid) from public, anon;
grant execute on function my_enrollment_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- M1 (continued): lock ordering.
--
-- Adding FOR UPDATE inside `recalc_enrollment_progress` alone introduced a
-- deadlock, reproduced by four concurrent completions on one enrollment:
--
--   content_progress.enrollment_id references course_enrollments(id), so the
--   INSERT quietly takes a FOR KEY SHARE lock on the parent enrollment row.
--   Each transaction then asked for FOR UPDATE on that same row and had to wait
--   for every other transaction's KEY SHARE — a cycle, and Postgres killed half
--   the calls with 40P01.
--
-- The lock is therefore taken at the very top of `complete_content_block`,
-- before the child insert. Every writer now acquires the enrollment row in the
-- same order, and the FOR UPDATE inside the recalc becomes a free re-acquire in
-- this path while still protecting Phase 5's `finalize_attempt`.
-- ---------------------------------------------------------------------------
create or replace function complete_content_block(
  p_enrollment uuid,
  p_block uuid,
  p_completed boolean
)
returns table (
  progress_percent numeric,
  completed_blocks int,
  total_blocks int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_block lesson_content_blocks%rowtype;
  v_module uuid;
  v_block_course uuid;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE here, not later: this is the lock-ordering fix described above.
  select * into v_enrollment
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  -- Ownership, not `can_view_enrollment`: staff may *read* a student's
  -- progress, they may never write it.
  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to change this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_block from lesson_content_blocks where id = p_block;

  if v_block.id is null then
    raise exception 'Content block not found' using errcode = 'no_data_found';
  end if;

  select l.module_id, m.course_id
  into v_module, v_block_course
  from lessons l
  join modules m on m.id = l.module_id
  where l.id = v_block.lesson_id;

  if v_block_course is distinct from v_enrollment.course_id then
    raise exception 'Content block does not belong to this course' using errcode = 'no_data_found';
  end if;

  if v_block.type in ('QUIZ', 'TASK') then
    raise exception 'INVALID_BLOCK_TYPE' using errcode = 'invalid_parameter_value';
  end if;

  select u.state into v_state
  from module_unlock_state(p_enrollment) u
  where u.module_id = v_module;

  -- COMPLETED is open too: un-ticking a block inside a finished module has to
  -- stay possible, otherwise the last completion would be irreversible. A NULL
  -- state (module not reported at all) fails closed through both comparisons.
  if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
    raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
  end if;

  if p_completed then
    insert into content_progress (enrollment_id, content_block_id)
    values (p_enrollment, p_block)
    on conflict (enrollment_id, content_block_id) do nothing;
  else
    delete from content_progress
    where enrollment_id = p_enrollment
      and content_block_id = p_block;
  end if;

  perform recalc_enrollment_progress(p_enrollment);

  perform log_audit(
    v_enrollment.organization_id,
    case when p_completed then 'content.completed' else 'content.uncompleted' end,
    'lesson_content_block',
    p_block,
    jsonb_build_object('enrollment_id', p_enrollment, 'course_id', v_enrollment.course_id)
  );

  return query
  select e.progress_percent, e.completed_blocks, e.total_blocks
  from course_enrollments e
  where e.id = p_enrollment;
end;
$$;

revoke execute on function complete_content_block(uuid, uuid, boolean) from public, anon;
grant execute on function complete_content_block(uuid, uuid, boolean) to authenticated;
