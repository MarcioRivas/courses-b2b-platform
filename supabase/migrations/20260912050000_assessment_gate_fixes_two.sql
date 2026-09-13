-- Phase 5C gate, second round (code-reviewer re-verification 260912).
-- B4 blocking, B5 high (H1 residue), plus M7 and two low items folded in.

-- ---------------------------------------------------------------------------
-- B4 (BLOCKING) — `submit_attempt` was B1 again, through the front door.
--
-- It ends with `return query select * from finalize_attempt(...)`, whose shape
-- is {status, total_score, score_percent, score_label}, and it IS granted to
-- `authenticated`. So the score a student cannot get from
-- `student_attempt_view` or `list_my_attempts` came straight back from the act
-- of submitting — verified live at 50% on a half-right mixed TASK. The
-- idempotent branch made it worse: re-submitting a finished attempt re-read its
-- stored score on demand.
--
-- Note for the record: phase-05 line 65 specifies exactly this return shape,
-- while lines 24 and 203 state the opposite rule (scores only when GRADED,
-- D24/F7). That is a contradiction inside the plan. The security rule wins —
-- an MC-only assessment still lands on GRADED and returns its score
-- immediately, so nothing legitimate is lost; only the ungraded window closes.
--
-- `finalize_attempt` keeps its full return: it is not executable by any client.
-- ---------------------------------------------------------------------------
create or replace function submit_attempt(p_attempt uuid, p_session uuid, p_answers jsonb default '[]')
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
begin
  v_attempt := assert_attempt_owner(p_attempt);

  if v_attempt.status <> 'IN_PROGRESS' then
    -- Already finished. Report the status, but mask the score unless a human
    -- has finished grading — otherwise this branch is a re-readable oracle.
    return query
    select
      a.status,
      case when a.status = 'GRADED' then a.total_score end,
      case when a.status = 'GRADED' then a.score_percent end,
      case when a.status = 'GRADED' then a.score_label end
    from assessment_attempts a
    where a.id = p_attempt;
    return;
  end if;

  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 0 then
    perform save_answers_batch(p_attempt, p_session, p_answers);
  end if;

  perform finalize_attempt(p_attempt, 'SUBMITTED');

  return query
  select
    a.status,
    case when a.status = 'GRADED' then a.total_score end,
    case when a.status = 'GRADED' then a.score_percent end,
    case when a.status = 'GRADED' then a.score_label end
  from assessment_attempts a
  where a.id = p_attempt;
end;
$$;

revoke execute on function submit_attempt(uuid, uuid, jsonb) from public, anon;
grant execute on function submit_attempt(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- B5(a) — the sweep deadlocked against every other finalizer.
--
-- Moving `finalize_attempt` to enrollment-then-attempt (last round's H1 fix)
-- inverted it against this function, which held `for update skip locked` on the
-- ATTEMPT row across its call into finalize — so finalize's new prologue then
-- asked for the enrollment while a lazy path held the enrollment and wanted the
-- attempt. Reproduced live as a 40P01 raised inside the prologue.
--
-- The row locks here were never needed: `finalize_attempt` is idempotent and
-- takes its own locks in the correct order, and a second sweep over an
-- already-finalized attempt is a no-op. Collecting ids without locking removes
-- the inversion entirely — and, as a bonus, ends the single long transaction
-- that used to wrap every expired attempt at once (M7).
-- ---------------------------------------------------------------------------
create or replace function finalize_expired_attempts()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select id, organization_id
    from assessment_attempts
    where status = 'IN_PROGRESS'
      and effective_end_at is not null
      and effective_end_at + interval '5 seconds' < now()
    -- Bounded so one sweep cannot grow without limit; the next tick (60s)
    -- picks up any remainder.
    limit 500
  loop
    begin
      perform finalize_attempt(v_row.id, 'AUTO');
      v_count := v_count + 1;
    exception
      when others then
        perform log_audit_system(
          v_row.organization_id,
          'attempt.finalize_failed',
          'assessment_attempt',
          v_row.id,
          jsonb_build_object('error', sqlerrm)
        );
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function finalize_expired_attempts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B5(b) — `grade_open_answer` still locked attempt-then-enrollment (through
-- `recalc_enrollment_progress`), so a professor grading while an attempt
-- finalized deadlocked and aborted the grading. Same enrollment-first prologue
-- as every other writer.
-- ---------------------------------------------------------------------------
create or replace function grade_open_answer(
  p_attempt uuid,
  p_attempt_question uuid,
  p_points numeric,
  p_feedback text default null
)
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
  v_question assessment_attempt_questions%rowtype;
  v_auto numeric(8, 2);
  v_manual numeric(8, 2);
  v_max numeric(8, 2);
  v_total numeric(8, 2);
  v_percent numeric(5, 2);
  v_label text;
  v_passing boolean;
  v_pending int;
  v_status attempt_status;
begin
  -- Enrollment first (B5b), matching finalize_attempt / complete_content_block.
  perform 1
  from course_enrollments
  where id = (select enrollment_id from assessment_attempts where id = p_attempt)
  for update;

  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_grade_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to grade this attempt' using errcode = 'insufficient_privilege';
  end if;

  if v_attempt.status = 'IN_PROGRESS' then
    raise exception 'ATTEMPT_IN_PROGRESS' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_question
  from assessment_attempt_questions
  where id = p_attempt_question and attempt_id = p_attempt;

  if v_question.id is null then
    raise exception 'Question does not belong to this attempt' using errcode = 'no_data_found';
  end if;

  if v_question.type <> 'OPEN_ENDED' then
    raise exception 'INVALID_BLOCK_TYPE' using errcode = 'invalid_parameter_value';
  end if;

  if p_points is null or p_points < 0 or p_points > v_question.points then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  insert into assessment_grades (
    attempt_id, attempt_question_id, points_awarded, is_correct, feedback, graded_by, graded_at
  )
  values (p_attempt, p_attempt_question, p_points, null, p_feedback, auth.uid(), now())
  on conflict (attempt_id, attempt_question_id) do update
  set points_awarded = excluded.points_awarded,
      feedback = excluded.feedback,
      graded_by = excluded.graded_by,
      graded_at = excluded.graded_at;

  select
    coalesce(sum(g.points_awarded) filter (where q.type = 'MULTIPLE_CHOICE'), 0),
    coalesce(sum(g.points_awarded) filter (where q.type = 'OPEN_ENDED'), 0),
    coalesce(sum(q.points), 0),
    count(*) filter (where q.type = 'OPEN_ENDED' and g.id is null)::int
  into v_auto, v_manual, v_max, v_pending
  from assessment_attempt_questions q
  left join assessment_grades g on g.attempt_question_id = q.id
  where q.attempt_id = p_attempt;

  v_total := v_auto + v_manual;
  v_percent := case when coalesce(v_max, 0) = 0 then null else round((v_total * 100) / v_max, 2) end;

  select r.label, r.is_passing into v_label, v_passing
  from resolve_score_label(v_attempt.organization_id, v_percent) r;

  v_status := case when v_pending = 0 then 'GRADED'::attempt_status else v_attempt.status end;

  update assessment_attempts
  set auto_score = v_auto,
      manual_score = v_manual,
      total_score = v_total,
      max_score = v_max,
      score_percent = v_percent,
      score_label = v_label,
      passed = v_passing,
      status = v_status,
      graded_at = case when v_status = 'GRADED' then now() else graded_at end
  where id = p_attempt;

  if v_status = 'GRADED' then
    perform recalc_enrollment_progress(v_attempt.enrollment_id);
  end if;

  perform log_audit(
    v_attempt.organization_id,
    'assessment.graded',
    'assessment_attempt',
    p_attempt,
    jsonb_build_object('attempt_question_id', p_attempt_question, 'points', p_points)
  );

  -- The grader is staff and may always see the score.
  return query
  select a.status, a.total_score, a.score_percent, a.score_label
  from assessment_attempts a
  where a.id = p_attempt;
end;
$$;

revoke execute on function grade_open_answer(uuid, uuid, numeric, text) from public, anon;
grant execute on function grade_open_answer(uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- M2 second-order — `assessment_module_id` picked an arbitrary block with
-- `limit 1` and no ordering, so a block planted in another course could decide
-- which module gates an assessment. Restrict the fallback to blocks in the
-- assessment's OWN course and make the choice deterministic.
-- ---------------------------------------------------------------------------
create or replace function assessment_module_id(p_assessment uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.module_id from assessments a where a.id = p_assessment),
    (
      select l.module_id
      from lesson_content_blocks b
      join lessons l on l.id = b.lesson_id
      join modules m on m.id = l.module_id
      join assessments a on a.id = b.assessment_id
      where b.assessment_id = p_assessment
        and m.course_id = a.course_id
      order by m.position, l.position, b.position
      limit 1
    )
  );
$$;

revoke execute on function assessment_module_id(uuid) from public, anon;
grant execute on function assessment_module_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- LOW — TRUNCATE was still granted and it IGNORES row level security. Not
-- reachable through PostgREST, but it is a table-wide delete sitting behind a
-- grant nobody needs.
-- ---------------------------------------------------------------------------
revoke truncate on table
  assessment_attempts,
  assessment_attempt_questions,
  assessment_grades,
  assessment_feedback,
  content_progress,
  course_enrollments
from anon, authenticated;

-- PostgREST caches the function signatures it will expose; without this a
-- stale cache can still try to call something this migration revoked.
notify pgrst, 'reload schema';
