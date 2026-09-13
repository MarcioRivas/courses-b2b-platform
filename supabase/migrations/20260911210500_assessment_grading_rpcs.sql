-- Phase 5C (part 5) — Grading, window extension, deletion guard and the two
-- read RPCs that are a student's ONLY path to their results.

-- ---------------------------------------------------------------------------
-- can_grade_attempt: org admin, or a professor of the attempt's course (B12).
-- ---------------------------------------------------------------------------
create function can_grade_attempt(p_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        (select is_org_admin(t.organization_id))
        or (select is_course_professor(a.course_id))
      from assessment_attempts t
      join assessments a on a.id = t.assessment_id
      where t.id = p_attempt
    ),
    false
  );
$$;

revoke execute on function can_grade_attempt(uuid) from public, anon;
grant execute on function can_grade_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- grade_open_answer: a human scoring one OPEN_ENDED answer.
-- When the last open answer is graded the attempt flips to GRADED, which is
-- also the moment its score becomes visible to the student.
-- ---------------------------------------------------------------------------
create function grade_open_answer(
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
  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_grade_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to grade this attempt' using errcode = 'insufficient_privilege';
  end if;

  -- An attempt still being written cannot be graded, and a cancelled one has
  -- nothing to grade.
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

  -- Grading can be what finally passes a QUIZ, which completes its block and
  -- may unlock a dependent module (D33).
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
-- upsert_attempt_feedback: the professor's overall note on an attempt.
-- ---------------------------------------------------------------------------
create function upsert_attempt_feedback(p_attempt uuid, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  if coalesce((select can_grade_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to grade this attempt' using errcode = 'insufficient_privilege';
  end if;

  if p_feedback is null or length(trim(p_feedback)) = 0 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  select organization_id into v_org from assessment_attempts where id = p_attempt;

  insert into assessment_feedback (attempt_id, professor_id, feedback)
  values (p_attempt, auth.uid(), p_feedback)
  on conflict (attempt_id) do update
  set feedback = excluded.feedback,
      professor_id = excluded.professor_id;

  perform log_audit(v_org, 'assessment.feedback_saved', 'assessment_attempt', p_attempt, '{}'::jsonb);
end;
$$;

revoke execute on function upsert_attempt_feedback(uuid, text) from public, anon;
grant execute on function upsert_attempt_feedback(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- extend_assessment_window: exam-day incident handling (D32).
-- Moves the assessment's deadline AND every in-flight attempt's, recomputing
-- `effective_end_at` so students already sitting the exam actually get the
-- extra time rather than being cut off by their snapshotted value.
-- ---------------------------------------------------------------------------
create function extend_assessment_window(p_assessment uuid, p_new_until timestamptz)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
       or (select is_course_professor(v_assessment.course_id)),
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
$$;

revoke execute on function extend_assessment_window(uuid, timestamptz) from public, anon;
grant execute on function extend_assessment_window(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_assessment: refuses once any attempt exists (C10). Student history is
-- never collateral damage of an authoring action.
-- ---------------------------------------------------------------------------
create function delete_assessment(p_assessment uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course(v_assessment.course_id)), false) is not true then
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
$$;

revoke execute on function delete_assessment(uuid) from public, anon;
grant execute on function delete_assessment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- student_attempt_view: the ONLY way a student reads their own attempt.
--
-- Scores, per-question correctness and feedback are withheld until the attempt
-- is GRADED (D24/F7). A SUBMITTED-but-ungraded attempt would otherwise be a
-- correctness oracle: seeing which answers scored tells the student the answer
-- key before the professor has finished — and before a retake.
--
-- The answer key itself is never selected here in any branch.
-- ---------------------------------------------------------------------------
create function student_attempt_view(p_attempt uuid)
returns table (
  attempt_question_id uuid,
  -- Quoted: `position` is reserved in a RETURNS TABLE column list.
  "position" int,
  type question_type,
  prompt text,
  options jsonb,
  points numeric,
  selected_option_id uuid,
  text_answer text,
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
-- list_my_attempts: per-assessment status for one enrollment. Feeds the
-- "Evaluaciones" section and the /learn strip (F13). Same GRADED-only rule.
-- ---------------------------------------------------------------------------
create function list_my_attempts(p_enrollment uuid)
returns table (
  assessment_id uuid,
  title text,
  kind assessment_kind,
  available_from timestamptz,
  available_until timestamptz,
  duration_seconds int,
  max_attempts int,
  passing_score int,
  attempts_used int,
  last_attempt_id uuid,
  last_status attempt_status,
  score_percent numeric,
  score_label text,
  passed boolean,
  overall_feedback text
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

  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to read this enrollment' using errcode = 'insufficient_privilege';
  end if;

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
    a.id,
    a.title,
    a.kind,
    a.available_from,
    a.available_until,
    a.duration_seconds,
    a.max_attempts,
    a.passing_score,
    coalesce(c.used, 0),
    l.id,
    l.status,
    case when l.status = 'GRADED' then l.score_percent end,
    case when l.status = 'GRADED' then l.score_label end,
    case when l.status = 'GRADED' then l.passed end,
    case when l.status = 'GRADED' then f.feedback end
  from assessments a
  left join latest l on l.assessment_id = a.id
  left join counts c on c.assessment_id = a.id
  left join assessment_feedback f on f.attempt_id = l.id
  where a.course_id = v_enrollment.course_id
    and a.status = 'PUBLISHED'
  order by a.kind, a.title;
end;
$$;

revoke execute on function list_my_attempts(uuid) from public, anon;
grant execute on function list_my_attempts(uuid) to authenticated;
