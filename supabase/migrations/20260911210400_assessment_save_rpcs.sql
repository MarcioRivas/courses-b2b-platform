-- Phase 5C (part 4) — Autosave and submission.
-- GRACE_SECONDS = 5 (D1): saves are accepted until effective_end_at + 5s, the
-- same instant every finalizer waits for.

-- ---------------------------------------------------------------------------
-- save_answers_batch: the student's write path for answers.
--
-- The payload is untrusted input, not a trusted diff (F5). Every item is
-- validated: the question must belong to THIS attempt, a chosen option must
-- exist in THIS attempt's snapshot (so a crafted option id cannot be stored),
-- text is length-capped, and the batch itself is capped.
--
-- `client_seq` is monotonic per question and the upsert only ever advances it
-- (D4/D30). This is what makes a retried request harmless: a late packet
-- carrying an older seq loses to the newer value already stored.
-- ---------------------------------------------------------------------------
create function save_answers_batch(p_attempt uuid, p_session uuid, p_answers jsonb)
returns table (
  accepted jsonb,
  server_now timestamptz,
  effective_end_at timestamptz,
  status attempt_status
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
  v_accepted jsonb;
  v_count int;
begin
  v_attempt := assert_attempt_owner(p_attempt);

  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(coalesce(p_answers, '[]'::jsonb));

  if v_count > 100 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  -- Expiry is reported through the returned `status`, NOT by raising.
  --
  -- This is deliberate and was found by test: `raise` aborts the transaction,
  -- so finalizing and then raising in the same call silently threw the
  -- finalization away and left the attempt IN_PROGRESS until cron caught it.
  -- Returning keeps the lazy finalize durable (C3) while still telling the
  -- client exactly what happened — `accepted` is empty and `status` is no
  -- longer IN_PROGRESS, which the action layer maps to ATTEMPT_EXPIRED.
  if v_attempt.status <> 'IN_PROGRESS' then
    return query select '[]'::jsonb, now(), v_attempt.effective_end_at, v_attempt.status;
    return;
  end if;

  if v_attempt.effective_end_at is not null
     and now() > v_attempt.effective_end_at + interval '5 seconds' then
    perform finalize_attempt(p_attempt, 'AUTO');
    select * into v_attempt from assessment_attempts where id = p_attempt;
    return query select '[]'::jsonb, now(), v_attempt.effective_end_at, v_attempt.status;
    return;
  end if;

  -- A displaced tab must not keep writing: it lost the session and its user is
  -- now answering somewhere else.
  if v_attempt.active_session_id is not null and v_attempt.active_session_id <> p_session then
    raise exception 'SESSION_LOCKED' using errcode = 'lock_not_available';
  end if;

  if v_count > 0 then
    with incoming as (
      select *
      from jsonb_to_recordset(p_answers) as x(
        attempt_question_id uuid,
        selected_option_id uuid,
        text_answer text,
        client_seq int
      )
    ),
    validated as (
      select
        i.attempt_question_id,
        i.selected_option_id,
        i.text_answer,
        i.client_seq
      from incoming i
      join assessment_attempt_questions q on q.id = i.attempt_question_id
      where q.attempt_id = p_attempt
        and i.client_seq is not null
        -- A selected option must exist in this attempt's own snapshot.
        and (
          i.selected_option_id is null
          or exists (
            select 1
            from jsonb_array_elements(q.options) o
            where (o ->> 'id')::uuid = i.selected_option_id
          )
        )
        and (i.text_answer is null or length(i.text_answer) <= 20000)
    ),
    updated as (
      update assessment_attempt_questions q
      set
        selected_option_id = v.selected_option_id,
        text_answer = v.text_answer,
        client_seq = v.client_seq,
        saved_at = now()
      from validated v
      where q.id = v.attempt_question_id
        -- Only advance. An out-of-order retry is ignored, not applied.
        and v.client_seq > q.client_seq
      returning q.id, q.client_seq
    )
    select coalesce(
      jsonb_agg(jsonb_build_object('attempt_question_id', u.id, 'client_seq', u.client_seq)),
      '[]'::jsonb
    )
    into v_accepted
    from updated u;
  else
    v_accepted := '[]'::jsonb;
  end if;

  -- Saving is also a sign of life: it refreshes the session so a student who
  -- types steadily without a heartbeat landing is not declared stale.
  update assessment_attempts
  set session_last_seen_at = now()
  where id = p_attempt
    and active_session_id = p_session;

  return query
  select v_accepted, now(), v_attempt.effective_end_at, v_attempt.status;
end;
$$;

revoke execute on function save_answers_batch(uuid, uuid, jsonb) from public, anon;
grant execute on function save_answers_batch(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_attempt: saves the still-pending answers and finalizes in ONE
-- transaction (D1).
--
-- The two steps are inseparable on purpose. A client that saved and then
-- submitted in two calls would leave a window in which the deadline passes
-- between them, and the answers typed last would be lost by the very action
-- meant to hand them in.
-- ---------------------------------------------------------------------------
create function submit_attempt(p_attempt uuid, p_session uuid, p_answers jsonb default '[]')
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
    -- Submitting twice is not an error: return what the attempt already is.
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a
    where a.id = p_attempt;
    return;
  end if;

  if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 0 then
    perform save_answers_batch(p_attempt, p_session, p_answers);
  end if;

  return query select * from finalize_attempt(p_attempt, 'SUBMITTED');
end;
$$;

revoke execute on function submit_attempt(uuid, uuid, jsonb) from public, anon;
grant execute on function submit_attempt(uuid, uuid, jsonb) to authenticated;
