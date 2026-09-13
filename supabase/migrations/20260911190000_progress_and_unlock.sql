-- Phase 4 — Student progression: module unlock state, content completion and
-- the enrollment progress cache.
--
-- Three rules this file exists to enforce (phase-04, D14/D17/D24/D25/D33):
--   1. Availability is decided here, never in TypeScript. The client renders
--      whatever `module_unlock_state` returns and gets rejected by
--      `complete_content_block` if it tries to act on a locked module.
--   2. `course_enrollments.progress_percent` is a cache written only by
--      `recalc_enrollment_progress`, inside the same transaction as the
--      completion that moved it. No triggers, no background jobs.
--   3. `content_progress` has no client write policy — this file owns the
--      only writer until `finalize_attempt` joins it in Phase 5.

-- ---------------------------------------------------------------------------
-- Shared ownership gate. Every student-facing progress RPC asserts through
-- this one function (D25) so the rule is written once: the owner while their
-- membership and org are ACTIVE (D29), or staff who may already read the row.
-- ---------------------------------------------------------------------------
create function can_view_enrollment(p_enrollment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        (e.user_id = auth.uid() and (select is_org_member(e.organization_id)))
        or (select is_org_admin(e.organization_id))
        or (select is_course_professor(e.course_id))
      from course_enrollments e
      where e.id = p_enrollment
    ),
    false
  );
$$;

revoke execute on function can_view_enrollment(uuid) from public, anon;
grant execute on function can_view_enrollment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- module_unlock_state: one call per course page returns every module's state
-- and the reason behind it. States: AVAILABLE | LOCKED_DEPENDENCY | UPCOMING |
-- EXPIRED | COMPLETED.
--
-- `reason` is the *most specific* explanation (§53) and is authored here, not
-- in the UI, so the server stays the single source of truth. Dates are handed
-- back raw (`available_from`/`available_until`) and formatted by the UI in the
-- organization's timezone (C16) — never interpolated into `reason`.
--
-- A module holding no required blocks reads as COMPLETED: there is nothing
-- left to do in it, and a MODULE_COMPLETED dependency pointing at it must not
-- deadlock (publishing only requires one block somewhere in the course).
-- ---------------------------------------------------------------------------
create function module_unlock_state(p_enrollment uuid)
returns table (
  module_id uuid,
  state text,
  reason text,
  available_from timestamptz,
  available_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_course courses%rowtype;
  v_offering course_offerings%rowtype;
  -- Non-null means the whole course is closed: every module reports EXPIRED
  -- with this reason and the per-module gates are never consulted.
  v_closed text;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  select * into v_course from courses where id = v_enrollment.course_id;
  select * into v_offering from course_offerings where id = v_enrollment.offering_id;

  if v_enrollment.status = 'CANCELLED' then
    v_closed := 'Tu inscripción a este curso fue cancelada.';
  elsif v_course.status = 'ARCHIVED' then
    v_closed := 'El curso ya no está disponible.';
  elsif v_offering.status = 'CANCELLED' then
    v_closed := 'Esta edición del curso fue cancelada.';
  elsif v_offering.ends_at is not null and v_offering.ends_at < now() then
    v_closed := 'El curso ya cerró.';
  end if;

  return query
  with scheduled as (
    -- A module with no schedule row for this offering is unbounded on both
    -- sides: always open for as long as the offering itself is.
    select
      m.id as module_id,
      m.position,
      s.available_from,
      s.available_until
    from modules m
    left join offering_module_schedules s
      on s.offering_id = v_enrollment.offering_id
     and s.module_id = m.id
    where m.course_id = v_enrollment.course_id
  ),
  done as (
    select
      m.id as module_id,
      not exists (
        select 1
        from lessons l
        join lesson_content_blocks b on b.lesson_id = l.id
        where l.module_id = m.id
          and b.is_required
          and not exists (
            select 1
            from content_progress cp
            where cp.enrollment_id = p_enrollment
              and cp.content_block_id = b.id
          )
      ) as is_done
    from modules m
    where m.course_id = v_enrollment.course_id
  ),
  blockers as (
    -- QUIZ_PASSED dependencies are deliberately absent: assessments do not
    -- exist before Phase 5, so that branch is a documented stub that treats
    -- the condition as met. -- P5: replace this CTE with a union that joins
    -- assessment_attempts and honours `min_score`.
    select
      d.module_id,
      (array_agg(blocking.title order by blocking.position))[1] as blocking_title
    from module_dependencies d
    join modules blocking on blocking.id = d.depends_on_module_id
    join done bd on bd.module_id = d.depends_on_module_id
    where d.condition = 'MODULE_COMPLETED'
      and bd.is_done is false
    group by d.module_id
  )
  select
    s.module_id,
    case
      when v_closed is not null then 'EXPIRED'
      when s.available_from is not null and s.available_from > now() then 'UPCOMING'
      when s.available_until is not null and s.available_until < now() then 'EXPIRED'
      when b.module_id is not null then 'LOCKED_DEPENDENCY'
      when d.is_done then 'COMPLETED'
      else 'AVAILABLE'
    end,
    case
      when v_closed is not null then v_closed
      when s.available_from is not null and s.available_from > now()
        then 'Este módulo todavía no se habilitó.'
      when s.available_until is not null and s.available_until < now()
        then 'El plazo de este módulo venció.'
      when b.module_id is not null
        then 'Primero tenés que completar «' || b.blocking_title || '».'
      when d.is_done then 'Completaste todo el contenido de este módulo.'
      else 'Podés avanzar con este módulo.'
    end,
    s.available_from,
    s.available_until
  from scheduled s
  join done d on d.module_id = s.module_id
  left join blockers b on b.module_id = s.module_id
  order by s.position;
end;
$$;

revoke execute on function module_unlock_state(uuid) from public, anon;
grant execute on function module_unlock_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- enrollment_module_summary: per-module required/completed counts for the
-- progress ring next to each module. Same ownership assert as the unlock
-- function (D25) — it must not become the one student RPC without one.
-- ---------------------------------------------------------------------------
create function enrollment_module_summary(p_enrollment uuid)
returns table (
  module_id uuid,
  total_required int,
  completed_required int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_view_enrollment(p_enrollment)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    m.id,
    count(b.id) filter (where b.is_required)::int,
    count(cp.id) filter (where b.is_required)::int
  from modules m
  left join lessons l on l.module_id = m.id
  left join lesson_content_blocks b on b.lesson_id = l.id
  left join content_progress cp
    on cp.content_block_id = b.id
   and cp.enrollment_id = p_enrollment
  where m.course_id = v_enrollment.course_id
  group by m.id, m.position
  order by m.position;
end;
$$;

revoke execute on function enrollment_module_summary(uuid) from public, anon;
grant execute on function enrollment_module_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- recalc_enrollment_progress: the only writer of the progress cache.
--
-- `total_blocks` is recounted from the course on **every** call (D14). There is
-- deliberately no trigger on `lesson_content_blocks`: a professor adding a
-- block during an exam must never fan out UPDATEs across every enrollment row
-- (RT-15). The denominator therefore refreshes lazily, on the student's next
-- completion — the UI labels it "X de Y bloques", not a contract.
--
-- Internal only: not granted to `authenticated`. The SECURITY DEFINER callers
-- (`complete_content_block` here, `finalize_attempt` in Phase 5) run as the
-- owner and reach it regardless.
-- ---------------------------------------------------------------------------
create function recalc_enrollment_progress(p_enrollment uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
  v_total int;
  v_completed int;
  v_percent numeric(5, 2);
begin
  select course_id into v_course from course_enrollments where id = p_enrollment;

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
      else null
    end
  where id = p_enrollment;
end;
$$;

revoke execute on function recalc_enrollment_progress(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- complete_content_block: the student's only write path into their progress.
--
-- Refuses, in order: a foreign or inactive enrollment, a block outside the
-- enrolled course, a QUIZ/TASK block (its progress row belongs to
-- `finalize_attempt` — a student must not be able to fabricate a passed
-- assessment, D33) and a block whose module is not currently open.
-- ---------------------------------------------------------------------------
create function complete_content_block(
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

  select * into v_enrollment from course_enrollments where id = p_enrollment;

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
  -- stay possible, otherwise the last completion would be irreversible.
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

-- ---------------------------------------------------------------------------
-- Backfill: enrollments created before this migration carry whatever
-- `total_blocks` was known at enrollment time (or 0 for rows the sync RPC
-- wrote). Bring every row in line once; from here the value is maintained
-- lazily by `recalc_enrollment_progress`.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  for v_id in select id from course_enrollments loop
    perform recalc_enrollment_progress(v_id);
  end loop;
end;
$$;
