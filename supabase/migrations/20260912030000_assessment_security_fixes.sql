-- Phase 5C gate fixes (code-reviewer 260912-0221). The gate failed on B1; H1–H3
-- and M1/M2/M5 are fixed here too, before any player UI is written on top.

-- ---------------------------------------------------------------------------
-- B1 (BLOCKING) — `assert_attempt_owner` was a score oracle.
--
-- It returns `assessment_attempts` — the WHOLE row, including score_percent,
-- score_label and passed — and was granted to `authenticated`. Because it
-- returns a table row type it appears in the generated types and PostgREST
-- exposes it, so a student could call it directly on their own SUBMITTED,
-- ungraded attempt and read the score that `student_attempt_view` deliberately
-- withholds until GRADED (F7/D24). Verified exploitable by the reviewer.
--
-- Every caller is a SECURITY DEFINER function in this schema, which reaches it
-- as the owner regardless of grants. Nothing in the application calls it.
-- ---------------------------------------------------------------------------
revoke execute on function assert_attempt_owner(uuid) from authenticated;

-- M1 — `resolve_score_label` takes the organization id as an argument and was
-- granted to `authenticated`, so any signed-in user could enumerate any
-- tenant's score scale. Internal only; the finalizers call it as owner.
revoke execute on function resolve_score_label(uuid, numeric) from authenticated;

-- ---------------------------------------------------------------------------
-- M5 — the attempt tables kept PostgREST's default write grants. RLS with no
-- write policy already denies them, but the grant is what makes that a
-- one-mistake-from-disaster arrangement: add a permissive policy for any reason
-- and writes open up. Only the answer-key table had been revoked (C8).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table
  assessment_attempts,
  assessment_attempt_questions,
  assessment_grades,
  assessment_feedback,
  content_progress,
  course_enrollments
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- H2 — students could not read their own attempt snapshot at all.
--
-- The old policy asked `exists (select 1 from assessment_attempts t where ...)`.
-- That inner select is itself subject to RLS, and students have no SELECT
-- policy on `assessment_attempts` (by design, F7) — so the EXISTS was always
-- false for the one role it was written for. The player would have shipped
-- against a table it could never read.
--
-- The visibility rule therefore moves into a SECURITY DEFINER helper, which
-- returns only a boolean and so leaks nothing itself.
-- ---------------------------------------------------------------------------
create function can_view_attempt(p_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        (t.user_id = auth.uid() and (select is_org_member(t.organization_id)))
        or (select is_org_admin(t.organization_id))
        or (select is_course_professor(a.course_id))
      from assessment_attempts t
      join assessments a on a.id = t.assessment_id
      where t.id = p_attempt
    ),
    false
  );
$$;

revoke execute on function can_view_attempt(uuid) from public, anon;
grant execute on function can_view_attempt(uuid) to authenticated;

drop policy assessment_attempt_questions_select on assessment_attempt_questions;

create policy assessment_attempt_questions_select on assessment_attempt_questions
  for select to authenticated
  using ((select can_view_attempt(attempt_id)));

-- ---------------------------------------------------------------------------
-- H1 — deadlock, same class as the Phase 4 one and reproduced by the reviewer.
--
-- `finalize_attempt` locked the ATTEMPT, then inserted `content_progress`
-- (whose FK takes KEY SHARE on the parent enrollment), then `recalc` asked for
-- FOR UPDATE on that same enrollment — a lock upgrade. Two finalizes touching
-- one enrollment (the cron sweep racing a lazy finalize or a submit) cycle, and
-- the student-side loser gets a raw 40P01 while submitting.
--
-- Fixed by taking the ENROLLMENT first, matching the order already used by
-- `complete_content_block` and `start_attempt`. Every writer now acquires the
-- enrollment before the attempt.
--
-- M2 — the completion loop also trusted `lesson_content_blocks.assessment_id`
-- without checking the block belonged to the enrolled course, so a block
-- planted in another tenant's course pointing at this assessment would have had
-- a `content_progress` row written for it. The loop is now scoped to the
-- enrollment's own course.
-- ---------------------------------------------------------------------------
create or replace function finalize_attempt(p_attempt uuid, p_reason text)
returns table (
  status attempt_status,
  total_score numeric,
  score_percent numeric,
  score_label text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
  v_course uuid;
  v_auto numeric(8, 2);
  v_manual numeric(8, 2);
  v_max numeric(8, 2);
  v_total numeric(8, 2);
  v_percent numeric(5, 2);
  v_label text;
  v_passing boolean;
  v_has_open boolean;
  v_status attempt_status;
  v_block record;
begin
  if p_reason is null or p_reason not in ('SUBMITTED', 'AUTO') then
    raise exception 'p_reason must be SUBMITTED or AUTO' using errcode = 'invalid_parameter_value';
  end if;

  -- Enrollment BEFORE attempt (H1). This is the lock order every writer uses.
  perform 1
  from course_enrollments
  where id = (select enrollment_id from assessment_attempts where id = p_attempt)
  for update;

  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null and v_attempt.user_id <> auth.uid() then
    raise exception 'Not allowed to finalize this attempt' using errcode = 'insufficient_privilege';
  end if;

  if v_attempt.status <> 'IN_PROGRESS' then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a where a.id = p_attempt;
    return;
  end if;

  if p_reason = 'AUTO'
     and (v_attempt.effective_end_at is null
          or now() <= v_attempt.effective_end_at + interval '5 seconds') then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a where a.id = p_attempt;
    return;
  end if;

  select e.course_id into v_course
  from course_enrollments e
  where e.id = v_attempt.enrollment_id;

  insert into assessment_grades (attempt_id, attempt_question_id, points_awarded, is_correct, graded_by)
  select
    q.attempt_id,
    q.id,
    case when q.selected_option_id = any (k.correct_option_ids) then q.points else 0 end,
    q.selected_option_id is not null and q.selected_option_id = any (k.correct_option_ids),
    null
  from assessment_attempt_questions q
  join assessment_attempt_answer_keys k on k.attempt_question_id = q.id
  where q.attempt_id = p_attempt
    and q.type = 'MULTIPLE_CHOICE'
  on conflict (attempt_id, attempt_question_id) do nothing;

  select
    coalesce(sum(g.points_awarded) filter (where q.type = 'MULTIPLE_CHOICE'), 0),
    coalesce(sum(g.points_awarded) filter (where q.type = 'OPEN_ENDED'), 0),
    coalesce(sum(q.points), 0),
    bool_or(q.type = 'OPEN_ENDED')
  into v_auto, v_manual, v_max, v_has_open
  from assessment_attempt_questions q
  left join assessment_grades g on g.attempt_question_id = q.id
  where q.attempt_id = p_attempt;

  v_total := v_auto + v_manual;
  v_percent := case when coalesce(v_max, 0) = 0 then null else round((v_total * 100) / v_max, 2) end;

  select r.label, r.is_passing into v_label, v_passing
  from resolve_score_label(v_attempt.organization_id, v_percent) r;

  v_status := case
    when coalesce(v_has_open, false) then
      case when p_reason = 'SUBMITTED' then 'SUBMITTED'::attempt_status else 'AUTO_SUBMITTED'::attempt_status end
    else 'GRADED'::attempt_status
  end;

  update assessment_attempts
  set
    status = v_status,
    auto_score = v_auto,
    manual_score = v_manual,
    total_score = v_total,
    max_score = v_max,
    score_percent = v_percent,
    score_label = v_label,
    passed = v_passing,
    submitted_at = coalesce(submitted_at, now()),
    graded_at = case when v_status = 'GRADED' then now() else graded_at end,
    active_session_id = null
  where id = p_attempt;

  -- Scoped to the enrolled course (M2): a QUIZ block living in another tenant's
  -- course must never earn progress on this enrollment.
  for v_block in
    select b.id as block_id, a.kind, a.passing_score
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    join assessments a on a.id = b.assessment_id
    where b.assessment_id = v_attempt.assessment_id
      and m.course_id = v_course
  loop
    if v_block.kind = 'TASK'
       or v_block.passing_score is null
       or coalesce(v_passing, false)
       or (v_percent is not null and v_percent >= v_block.passing_score) then
      insert into content_progress (enrollment_id, content_block_id)
      values (v_attempt.enrollment_id, v_block.block_id)
      on conflict (enrollment_id, content_block_id) do nothing;
    end if;
  end loop;

  perform recalc_enrollment_progress(v_attempt.enrollment_id);

  perform log_audit_system(
    v_attempt.organization_id,
    case when p_reason = 'SUBMITTED' then 'assessment.submitted' else 'assessment.auto_submitted' end,
    'assessment_attempt',
    p_attempt,
    jsonb_build_object(
      'assessment_id', v_attempt.assessment_id,
      'score_percent', v_percent,
      'status', v_status
    )
  );

  return query
  select a.status, a.total_score, a.score_percent, a.score_label
  from assessment_attempts a where a.id = p_attempt;
end;
$$;

revoke execute on function finalize_attempt(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- H2b — `student_attempt_view` omitted `client_seq`, so a player resuming after
-- a reload had no way to know how far the server's per-question counter had
-- got. A restarted counter would lose every subsequent save to the
-- only-advance guard, silently and permanently.
-- ---------------------------------------------------------------------------
drop function student_attempt_view(uuid);

create function student_attempt_view(p_attempt uuid)
returns table (
  attempt_question_id uuid,
  "position" int,
  type question_type,
  prompt text,
  options jsonb,
  points numeric,
  selected_option_id uuid,
  text_answer text,
  client_seq int,
  points_awarded numeric,
  is_correct boolean,
  feedback text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
  v_graded boolean;
begin
  v_attempt := assert_attempt_owner(p_attempt);
  v_graded := v_attempt.status = 'GRADED';

  return query
  select
    q.id,
    q.position,
    q.type,
    q.prompt,
    q.options,
    q.points,
    q.selected_option_id,
    q.text_answer,
    q.client_seq,
    case when v_graded then g.points_awarded end,
    case when v_graded then g.is_correct end,
    case when v_graded then g.feedback end
  from assessment_attempt_questions q
  left join assessment_grades g on g.attempt_question_id = q.id
  where q.attempt_id = p_attempt
  order by q.position;
end;
$$;

revoke execute on function student_attempt_view(uuid) from public, anon;
grant execute on function student_attempt_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- H3 — a read-only attempt header.
--
-- Previously the only way to learn an attempt's status or deadline was
-- `heartbeat`, which CLAIMS the session as a side effect. That makes it unsafe
-- for the RSC shell or a results page: merely looking at an attempt would steal
-- the lock from the tab actually taking it. This observes without touching.
--
-- It returns the timing and status fields only — never a score, so it cannot
-- become the oracle B1 was.
-- ---------------------------------------------------------------------------
create function attempt_header(p_attempt uuid)
returns table (
  attempt_id uuid,
  assessment_id uuid,
  status attempt_status,
  attempt_number int,
  started_at timestamptz,
  effective_end_at timestamptz,
  active_session_id uuid,
  server_now timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
begin
  if coalesce((select can_view_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to read this attempt' using errcode = 'insufficient_privilege';
  end if;

  select * into v_attempt from assessment_attempts where id = p_attempt;

  return query
  select
    v_attempt.id,
    v_attempt.assessment_id,
    v_attempt.status,
    v_attempt.attempt_number,
    v_attempt.started_at,
    v_attempt.effective_end_at,
    v_attempt.active_session_id,
    now();
end;
$$;

revoke execute on function attempt_header(uuid) from public, anon;
grant execute on function attempt_header(uuid) to authenticated;
