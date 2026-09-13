-- Phase 5C (part 2) — Scoring and finalization.
--
-- GRACE_SECONDS = 5 (D1). This interval appears in exactly four places across
-- the phase: here (the AUTO reason guard), in `heartbeat`, in
-- `save_answers_batch`, and in `finalize_expired_attempts`. They must agree.
-- A finalizer that used 0s would destroy the very packets the 5s tolerance
-- exists to accept — that was red-team finding #1.

-- ---------------------------------------------------------------------------
-- resolve_score_label: percent -> the organization's label for it (D11).
-- A TOTAL function: an org with no configured scale, or a NULL percent (a
-- zero-point assessment), yields (null, null) rather than no row, so callers
-- can always `select ... into` without a not-found branch.
-- ---------------------------------------------------------------------------
create function resolve_score_label(p_org uuid, p_percent numeric)
returns table (label text, is_passing boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.label, r.is_passing
  from score_scale_ranges r
  where p_percent is not null
    and r.organization_id = p_org
    and p_percent between r.min_score and r.max_score
  union all
  select null::text, null::boolean
  where not exists (
    select 1
    from score_scale_ranges r
    where p_percent is not null
      and r.organization_id = p_org
      and p_percent between r.min_score and r.max_score
  )
  limit 1;
$$;

revoke execute on function resolve_score_label(uuid, numeric) from public, anon;
grant execute on function resolve_score_label(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- log_audit_system: an audit write with no session behind it.
--
-- `log_audit` requires the caller to be a member of the organization, which is
-- correct for user-initiated actions but fatal for the pg_cron sweep: cron runs
-- as `postgres` with `auth.uid()` NULL, so `is_org_member` is false and
-- log_audit would raise — aborting the finalization it was meant to record.
-- This variant records the same row with whatever actor exists (NULL for cron)
-- and is revoked from every client role.
-- ---------------------------------------------------------------------------
create function log_audit_system(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke execute on function log_audit_system(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- assessment_module_id: which module gates an assessment.
--
-- An EXAM carries `module_id` directly. A QUIZ/TASK is reached through a lesson
-- content block, so its module is the block's. Used by `start_attempt` to ask
-- `module_unlock_state` whether the student may be here at all.
-- ---------------------------------------------------------------------------
create function assessment_module_id(p_assessment uuid)
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
      where b.assessment_id = p_assessment
      limit 1
    )
  );
$$;

revoke execute on function assessment_module_id(uuid) from public, anon;
grant execute on function assessment_module_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- finalize_attempt: the only path from IN_PROGRESS to a scored attempt.
--
-- REVOKED FROM EVERYONE (D25). Reached three ways, all server-side: the pg_cron
-- sweep, a lazy finalize inside `heartbeat`/`save_answers_batch`, and
-- `submit_attempt`. A student cannot call it directly, so they cannot finalize
-- early, re-finalize, or finalize somebody else's attempt.
--
-- Idempotent: a no-op unless the attempt is still IN_PROGRESS. That is what
-- makes the cron sweep and the lazy path safe to race against each other.
-- ---------------------------------------------------------------------------
create function finalize_attempt(p_attempt uuid, p_reason text)
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

  select * into v_attempt from assessment_attempts where id = p_attempt for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;

  -- Called with a session (lazy finalize, submit) it must be the owner's own
  -- attempt; called without one it is pg_cron, which is trusted.
  if auth.uid() is not null and v_attempt.user_id <> auth.uid() then
    raise exception 'Not allowed to finalize this attempt' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotence: whoever got here first already did the work.
  if v_attempt.status <> 'IN_PROGRESS' then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a
    where a.id = p_attempt;
    return;
  end if;

  -- An automatic finalize may only happen once the grace period has elapsed
  -- (D1). Without this a cron tick landing exactly on the deadline would close
  -- the attempt while a save from 2s ago was still in flight.
  if p_reason = 'AUTO'
     and (v_attempt.effective_end_at is null
          or now() <= v_attempt.effective_end_at + interval '5 seconds') then
    return query
    select a.status, a.total_score, a.score_percent, a.score_label
    from assessment_attempts a
    where a.id = p_attempt;
    return;
  end if;

  -- Auto-grade every multiple-choice answer against the key. The key table is
  -- unreachable from any client; this function runs as the owner and can read
  -- it. An unanswered MC question scores 0, not NULL.
  insert into assessment_grades (attempt_id, attempt_question_id, points_awarded, is_correct, graded_by)
  select
    q.attempt_id,
    q.id,
    case when q.selected_option_id = any (k.correct_option_ids) then q.points else 0 end,
    q.selected_option_id is not null and q.selected_option_id = any (k.correct_option_ids),
    null
  from assessment_attempt_questions q
  join assessment_attempt_answer_keys k
    on k.attempt_question_id = q.id
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

  -- Guard the zero-point assessment: a percent of 0/0 is not 0, it is unknown.
  -- `resolve_score_label` is total and returns (null, null) for a NULL percent.
  v_percent := case when coalesce(v_max, 0) = 0 then null else round((v_total * 100) / v_max, 2) end;

  select r.label, r.is_passing into v_label, v_passing
  from resolve_score_label(v_attempt.organization_id, v_percent) r;

  -- An assessment with open answers still needs a human; only a fully
  -- auto-gradable one is GRADED on the spot.
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
    -- Releasing the lock here matters: a finalized attempt must not keep a tab
    -- "locked out" of an attempt that no longer accepts writes anyway.
    active_session_id = null
  where id = p_attempt;

  -- Finishing the assessment is what completes its QUIZ/TASK block (D33) — the
  -- student has no manual toggle for those. A QUIZ counts only when passed (or
  -- when the assessment defines no passing score); a TASK counts on submission,
  -- since its grade is still pending.
  for v_block in
    select b.id as block_id, a.kind, a.passing_score
    from lesson_content_blocks b
    join assessments a on a.id = b.assessment_id
    where b.assessment_id = v_attempt.assessment_id
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
  from assessment_attempts a
  where a.id = p_attempt;
end;
$$;

revoke execute on function finalize_attempt(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- finalize_expired_attempts: the pg_cron sweep (C3).
--
-- `for update skip locked` so a row already being finalized by a lazy path is
-- left alone rather than blocking the sweep. Each row is wrapped in its own
-- exception block: one poisoned attempt must not abort the whole run, or a
-- single bad row would freeze auto-submission for every student on the
-- platform. Failures are audited and the sweep continues.
-- ---------------------------------------------------------------------------
create function finalize_expired_attempts()
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
    for update skip locked
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
