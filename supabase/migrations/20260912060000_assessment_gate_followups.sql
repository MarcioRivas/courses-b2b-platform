-- Phase 5C gate follow-ups (third verification, N1 + N3). The gate passed; these
-- are the two cheap findings it raised on the way through.

-- ---------------------------------------------------------------------------
-- N1 — `grade_open_answer` authorised AFTER taking locks.
--
-- The enrollment-first prologue added for B5 was placed above the permission
-- check, which broke the phase's own "ownership assert as the first statement"
-- rule and turned the function into an existence oracle: a caller with no right
-- to the attempt got `no_data_found` for a made-up uuid but `insufficient_
-- privilege` for a real one belonging to another tenant, which distinguishes
-- them.
--
-- `can_grade_attempt` is STABLE and takes no locks, so it costs nothing to run
-- first. Both cases now answer 42501 identically: an unauthorised caller cannot
-- tell a real attempt from an imaginary one.
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
  -- Authorisation FIRST, before any lock and before any row is revealed (N1).
  -- A non-existent attempt and someone else's attempt are indistinguishable
  -- from here: both fail this check.
  if coalesce((select can_grade_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to grade this attempt' using errcode = 'insufficient_privilege';
  end if;

  -- Then the locks, enrollment before attempt (B5b), matching every writer.
  perform 1
  from course_enrollments
  where id = (select enrollment_id from assessment_attempts where id = p_attempt)
  for update;

  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
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

  return query
  select a.status, a.total_score, a.score_percent, a.score_label
  from assessment_attempts a
  where a.id = p_attempt;
end;
$$;

revoke execute on function grade_open_answer(uuid, uuid, numeric, text) from public, anon;
grant execute on function grade_open_answer(uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- N3 — TRUNCATE was still granted to anon/authenticated on every other table
-- in `public`, including `audit_logs` and `platform_admins`. TRUNCATE IGNORES
-- row level security, and nine of those tables have no write policy at all, so
-- the grant was the only thing standing between a signed-in user and emptying
-- them. Not reachable through PostgREST today, which is why it went unnoticed —
-- but it is a table-wide delete behind a grant nobody needs.
--
-- Done as a loop so a table added later by a migration that forgets this is the
-- only gap, rather than every table being one.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  for v_table in
    select quote_ident(tablename)
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke truncate on table public.%s from anon, authenticated', v_table);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
