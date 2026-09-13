-- Phase 5C (part 3) — Attempt lifecycle: start, session, autosave, submit.
-- GRACE_SECONDS = 5 (D1), matching the finalizers in the previous migration.

-- ---------------------------------------------------------------------------
-- start_attempt: the only way an attempt comes into existence.
--
-- Takes the enrollment row FOR UPDATE as its first act. That single lock does
-- the work of an entire distributed-locking scheme: a double-clicked button and
-- two devices pressing "Comenzar" at the same instant serialize here, so
-- `attempt_number` is computed under the lock and cannot be duplicated.
-- ---------------------------------------------------------------------------
create function start_attempt(p_enrollment uuid, p_assessment uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_assessment assessments%rowtype;
  v_module uuid;
  v_state text;
  v_used int;
  v_existing uuid;
  v_attempt_id uuid;
  v_effective_end timestamptz;
  v_question record;
  v_position int := 0;
  v_attempt_question_id uuid;
  v_options jsonb;
  v_correct uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment
  from course_enrollments
  where id = p_enrollment
  for update;

  if v_enrollment.id is null then
    raise exception 'Enrollment not found' using errcode = 'no_data_found';
  end if;

  if v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to use this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null or v_assessment.course_id <> v_enrollment.course_id then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if v_assessment.status <> 'PUBLISHED' then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = 'invalid_parameter_value';
  end if;

  -- The availability window has NO grace period: 5s of tolerance exists to
  -- save answers already typed, not to let someone in late (D1).
  if (v_assessment.available_from is not null and now() < v_assessment.available_from)
     or (v_assessment.available_until is not null and now() > v_assessment.available_until) then
    raise exception 'ASSESSMENT_EXPIRED' using errcode = 'invalid_parameter_value';
  end if;

  -- The module gate is the same one the course page renders, so a student can
  -- never reach an assessment inside a module they have not unlocked.
  v_module := (select assessment_module_id(p_assessment));

  if v_module is not null then
    select u.state into v_state
    from module_unlock_state(p_enrollment) u
    where u.module_id = v_module;

    if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
      raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Resuming beats starting: an interrupted attempt must be handed back
  -- unchanged, never replaced by a fresh snapshot.
  select id into v_existing
  from assessment_attempts
  where enrollment_id = p_enrollment
    and assessment_id = p_assessment
    and status = 'IN_PROGRESS';

  if v_existing is not null then
    return v_existing;
  end if;

  select count(*)::int into v_used
  from assessment_attempts
  where enrollment_id = p_enrollment
    and assessment_id = p_assessment;

  -- NULL max_attempts means unlimited (B3).
  if v_assessment.max_attempts is not null and v_used >= v_assessment.max_attempts then
    raise exception 'ATTEMPT_LIMIT_REACHED' using errcode = 'invalid_parameter_value';
  end if;

  -- LEAST ignores NULLs, so an untimed quiz with no window yields NULL: no
  -- deadline at all (D12). Written as a plain column (D31).
  v_effective_end := least(
    case when v_assessment.duration_seconds is not null
      then now() + make_interval(secs => v_assessment.duration_seconds)
    end,
    v_assessment.available_until
  );

  insert into assessment_attempts (
    assessment_id, enrollment_id, user_id, organization_id,
    attempt_number, duration_seconds, availability_until, effective_end_at
  )
  values (
    p_assessment, p_enrollment, auth.uid(), v_enrollment.organization_id,
    v_used + 1, v_assessment.duration_seconds, v_assessment.available_until, v_effective_end
  )
  returning id into v_attempt_id;

  -- Snapshot. Fixed list first (author order), then the random draw from the
  -- bank excluding anything already fixed, so a question cannot appear twice.
  -- An EXAM shuffles; a QUIZ keeps the author's order (D34).
  for v_question in
    with fixed as (
      select q.id, q.type, q.prompt, aq.points, aq.position as author_position
      from assessment_questions aq
      join questions q on q.id = aq.question_id
      where aq.assessment_id = p_assessment
        and q.is_active
    ),
    drawn as (
      select q.id, q.type, q.prompt, q.default_points as points, 1000000 as author_position
      from questions q
      where v_assessment.random_question_count is not null
        and q.question_bank_id = v_assessment.question_bank_id
        and q.is_active
        and q.id not in (select f.id from fixed f)
      order by random()
      limit coalesce(v_assessment.random_question_count, 0)
    )
    select * from (select * from fixed union all select * from drawn) s
    order by
      case when v_assessment.kind = 'EXAM' then random() else s.author_position end
  loop
    v_position := v_position + 1;

    -- Options are shuffled and stripped of `is_correct` before they are stored
    -- anywhere a student can read. The key goes to its own table.
    select
      coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.shuffled), '[]'::jsonb),
      coalesce(array_agg(o.id) filter (where o.is_correct), '{}'::uuid[])
    into v_options, v_correct
    from (
      select qo.id, qo.label, qo.is_correct, random() as shuffled
      from question_options qo
      where qo.question_id = v_question.id
    ) o;

    insert into assessment_attempt_questions (
      attempt_id, question_id, position, type, prompt, options, points
    )
    values (
      v_attempt_id, v_question.id, v_position, v_question.type,
      v_question.prompt, v_options, v_question.points
    )
    returning id into v_attempt_question_id;

    insert into assessment_attempt_answer_keys (attempt_id, attempt_question_id, correct_option_ids)
    values (v_attempt_id, v_attempt_question_id, v_correct);
  end loop;

  perform log_audit_system(
    v_enrollment.organization_id,
    'assessment.started',
    'assessment_attempt',
    v_attempt_id,
    jsonb_build_object('assessment_id', p_assessment, 'attempt_number', v_used + 1)
  );

  return v_attempt_id;
exception
  -- Lost the race into the partial unique index: the winner's attempt is the
  -- right answer, not an error.
  when unique_violation then
    select id into v_existing
    from assessment_attempts
    where enrollment_id = p_enrollment
      and assessment_id = p_assessment
      and status = 'IN_PROGRESS';
    if v_existing is null then
      raise;
    end if;
    return v_existing;
end;
$$;

revoke execute on function start_attempt(uuid, uuid) from public, anon;
grant execute on function start_attempt(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- attempt_owner_guard: the ownership assertion every attempt RPC opens with.
-- Returns the locked attempt row so callers do not re-read it.
-- ---------------------------------------------------------------------------
create function assert_attempt_owner(p_attempt uuid)
returns assessment_attempts
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_attempt from assessment_attempts where id = p_attempt;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.user_id <> auth.uid()
     or coalesce((select is_org_member(v_attempt.organization_id)), false) is not true then
    raise exception 'Not allowed to use this attempt' using errcode = 'insufficient_privilege';
  end if;

  return v_attempt;
end;
$$;

revoke execute on function assert_attempt_owner(uuid) from public, anon;
grant execute on function assert_attempt_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- heartbeat: claims the session on first call, refreshes it afterwards (D3).
--
-- The session lock is UX, not security (§29). It stops a student confusing
-- themselves across two tabs; it is NOT what protects the attempt — that is the
-- ownership check plus the absence of any client write policy. Hence the
-- takeover is unconditional for the same user.
-- ---------------------------------------------------------------------------
create function heartbeat(p_attempt uuid, p_session uuid, p_force boolean default false)
returns table (
  active_session_id uuid,
  server_now timestamptz,
  effective_end_at timestamptz,
  status attempt_status,
  stale_seconds int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
  v_stale int := coalesce(current_setting('app.session_stale_seconds', true)::int, 90);
  v_other_age int;
begin
  v_attempt := assert_attempt_owner(p_attempt);

  if v_attempt.status = 'IN_PROGRESS' then
    -- Lazy finalize: any touch after the deadline + grace closes the attempt,
    -- so auto-submission does not depend on cron being alive (C3).
    if v_attempt.effective_end_at is not null
       and now() > v_attempt.effective_end_at + interval '5 seconds' then
      perform finalize_attempt(p_attempt, 'AUTO');
      select * into v_attempt from assessment_attempts where id = p_attempt;
    end if;
  end if;

  if v_attempt.status = 'IN_PROGRESS' then
    v_other_age := case
      when v_attempt.active_session_id is null or v_attempt.active_session_id = p_session then null
      else extract(epoch from (now() - coalesce(v_attempt.session_last_seen_at, v_attempt.started_at)))::int
    end;

    if v_other_age is not null and v_other_age < v_stale and not p_force then
      raise exception 'SESSION_LOCKED' using errcode = 'lock_not_available';
    end if;

    update assessment_attempts
    set active_session_id = p_session,
        session_last_seen_at = now()
    where id = p_attempt
    returning * into v_attempt;
  end if;

  return query
  select
    v_attempt.active_session_id,
    now(),
    v_attempt.effective_end_at,
    v_attempt.status,
    v_stale;
end;
$$;

revoke execute on function heartbeat(uuid, uuid, boolean) from public, anon;
grant execute on function heartbeat(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- release_session: called on `pagehide` through the keepalive route handler.
-- Clears the lock only when it still belongs to the departing tab.
-- ---------------------------------------------------------------------------
create function release_session(p_attempt uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
begin
  v_attempt := assert_attempt_owner(p_attempt);

  update assessment_attempts
  set active_session_id = null,
      session_last_seen_at = now()
  where id = p_attempt
    and active_session_id = p_session;
end;
$$;

revoke execute on function release_session(uuid, uuid) from public, anon;
grant execute on function release_session(uuid, uuid) to authenticated;
