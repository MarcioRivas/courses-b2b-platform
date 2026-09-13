-- Phase 5 review fix (M2) — replace-all authoring writes were three separate
-- PostgREST calls (update/delete/insert), not one transaction: a failed
-- second or third step could leave an MC question with zero options, or an
-- assessment with an empty fixed list, with nothing rejecting it later.
-- These two SECURITY DEFINER RPCs make each replace-all atomic (one plpgsql
-- function body = one transaction) and move the validation server-side so a
-- stale/crafted client payload cannot bypass it.

-- ---------------------------------------------------------------------------
-- replace_question_options: delete + insert a question's MC options in one
-- transaction. Same invariant the Zod schema already enforces client-side
-- (`mcOptionsSchema`, 5A step 2) — 2..6 options, exactly one correct, every
-- label non-empty — re-checked here because the RPC is the actual boundary.
-- ---------------------------------------------------------------------------
create function replace_question_options(p_question uuid, p_options jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bank uuid;
  v_org uuid;
  v_count int;
  v_correct_count int;
begin
  select question_bank_id, organization_id into v_bank, v_org from questions where id = p_question;

  if v_bank is null then
    raise exception 'Question not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_question_bank(v_bank)), false) is not true then
    raise exception 'Not allowed to edit this question' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_options, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_options);
  if v_count < 2 or v_count > 6 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) filter (where x.is_correct is true), count(*) filter (where x.label is null or btrim(x.label) = '')
  into v_correct_count, v_count
  from jsonb_to_recordset(p_options) as x(label text, position int, is_correct boolean);

  if v_correct_count <> 1 or v_count > 0 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  delete from question_options where question_id = p_question;

  insert into question_options (question_id, label, position, is_correct)
  select p_question, x.label, x.position, coalesce(x.is_correct, false)
  from jsonb_to_recordset(p_options) as x(label text, position int, is_correct boolean);

  perform log_audit(
    v_org,
    'question.options_replaced',
    'question',
    p_question,
    jsonb_build_object('count', jsonb_array_length(p_options))
  );
end;
$$;

revoke execute on function replace_question_options(uuid, jsonb) from public, anon;
grant execute on function replace_question_options(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- set_assessment_questions: delete + insert an assessment's fixed question
-- list in one transaction. Every question id must belong to a bank the
-- caller can edit and must be active (closes the gap flagged in the review:
-- `assessment_questions_all`'s RLS only checked the assessment's course, not
-- that the question itself was one the caller was allowed to see); points
-- must be positive and positions unique.
-- ---------------------------------------------------------------------------
create function set_assessment_questions(p_assessment uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
  v_count int;
  v_valid_count int;
begin
  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_course(v_assessment.course_id)), false) is not true then
    raise exception 'Not allowed to edit this assessment' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  if v_count > 0 then
    if exists (
      select 1
      from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
      where x.question_id is null or x.position is null or x.points is null or x.points <= 0
    ) then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    if (
      select count(distinct x.position) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count
    or (
      select count(distinct x.question_id) from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    ) <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;

    select count(*) into v_valid_count
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric)
    join questions q on q.id = x.question_id
    where q.is_active is true
      and coalesce((select can_edit_question_bank(q.question_bank_id)), false) is true;

    if v_valid_count <> v_count then
      raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  delete from assessment_questions where assessment_id = p_assessment;

  if v_count > 0 then
    insert into assessment_questions (assessment_id, question_id, position, points)
    select p_assessment, x.question_id, x.position, x.points
    from jsonb_to_recordset(p_items) as x(question_id uuid, position int, points numeric);
  end if;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.questions_set',
    'assessment',
    p_assessment,
    jsonb_build_object('count', v_count)
  );
end;
$$;

revoke execute on function set_assessment_questions(uuid, jsonb) from public, anon;
grant execute on function set_assessment_questions(uuid, jsonb) to authenticated;
