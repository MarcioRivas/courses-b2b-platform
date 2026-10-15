-- Event notifications emitted from assessment_attempts transitions:
--   ASSESSMENT_GRADED      → the student, on MANUAL grading only
--   LATE_SUBMISSIONS       → edition professors, grouped per assessment
--   ATTEMPT_NEEDS_GRADING  → edition professors, grouped per assessment
--
-- A trigger instead of editing finalize_attempt / submit_task / grading RPCs:
-- those are long functions redefined across migrations, and every writer of
-- assessment_attempts is covered here at once.
--
-- Status transitions relied on:
--   auto-grade (finalize_attempt)  IN_PROGRESS → GRADED          (no notification)
--   manual grade (grade_task_submission, recompute_attempt_score via
--   grade_open_answer / grade_attempt_batch)
--                                   SUBMITTED|AUTO_SUBMITTED|GRADED → GRADED, graded_at changes
--   open-ended finalize             IN_PROGRESS → SUBMITTED|AUTO_SUBMITTED
--   task submit (submit_task)       insert/update to SUBMITTED, submitted_at changes
--
-- Grouped counts are recomputed at emit time (READ COMMITTED): two simultaneous
-- submissions may both store n instead of n+1 until the next event, and counts
-- do not go down as attempts are graded. Good enough for a bell hint.

/** Upserts one grouped notification for every professor of the assessment's edition. */
create function notify_offering_professors(
  p_assessment uuid,
  p_type notification_type,
  p_count int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
  v_course_title text;
  v_payload jsonb;
  v_prof uuid;
begin
  select * into v_assessment from assessments where id = p_assessment;
  if v_assessment.id is null then
    return;
  end if;

  select c.title into v_course_title
  from course_offerings o
  join courses c on c.id = o.course_id
  where o.id = v_assessment.offering_id;

  v_payload := jsonb_build_object(
    'assessmentId', v_assessment.id,
    'assessmentTitle', v_assessment.title,
    'kind', v_assessment.kind,
    'offeringId', v_assessment.offering_id,
    'courseTitle', v_course_title,
    'count', p_count
  );

  for v_prof in
    select op.user_id
    from offering_professors op
    join organization_memberships om
      on om.user_id = op.user_id
     and om.organization_id = v_assessment.organization_id
     and om.status = 'ACTIVE'
    where op.offering_id = v_assessment.offering_id
    -- Fixed lock order: concurrent submissions upsert the same rows without deadlocking.
    order by op.user_id
  loop
    perform upsert_notification(
      v_prof, v_assessment.organization_id, p_type, v_assessment.id,
      v_assessment.offering_id, v_payload, true
    );
  end loop;
end;
$$;

revoke execute on function notify_offering_professors(uuid, notification_type, int)
  from public, anon, authenticated;

create function notify_on_attempt_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
  v_course_title text;
  v_count int;
begin
  select * into v_assessment from assessments where id = new.assessment_id;
  if v_assessment.id is null then
    return null;
  end if;

  -- ASSESSMENT_GRADED: manual grading (incl. regrade). Auto-grade starts from IN_PROGRESS.
  if tg_op = 'UPDATE'
     and new.status = 'GRADED'
     and old.status <> 'IN_PROGRESS'
     and new.graded_at is distinct from old.graded_at then
    select c.title into v_course_title
    from course_offerings o
    join courses c on c.id = o.course_id
    where o.id = v_assessment.offering_id;

    perform upsert_notification(
      new.user_id, new.organization_id, 'ASSESSMENT_GRADED', new.id, v_assessment.offering_id,
      jsonb_build_object(
        'assessmentId', v_assessment.id,
        'assessmentTitle', v_assessment.title,
        'kind', v_assessment.kind,
        'attemptId', new.id,
        'enrollmentId', new.enrollment_id,
        'courseTitle', v_course_title
      ),
      true
    );
  end if;

  -- LATE_SUBMISSIONS: a (re)submission after the deadline.
  if new.status = 'SUBMITTED'
     and new.submitted_late
     and (tg_op = 'INSERT' or new.submitted_at is distinct from old.submitted_at) then
    select count(*)::int into v_count
    from assessment_attempts t
    where t.assessment_id = new.assessment_id
      and t.status = 'SUBMITTED'
      and t.submitted_late;

    perform notify_offering_professors(new.assessment_id, 'LATE_SUBMISSIONS', v_count);
  end if;

  -- ATTEMPT_NEEDS_GRADING: quiz/exam finalized with open answers pending.
  if tg_op = 'UPDATE'
     and v_assessment.kind <> 'TASK'
     and old.status = 'IN_PROGRESS'
     and new.status in ('SUBMITTED', 'AUTO_SUBMITTED') then
    select count(*)::int into v_count
    from assessment_attempts t
    where t.assessment_id = new.assessment_id
      and t.status in ('SUBMITTED', 'AUTO_SUBMITTED');

    perform notify_offering_professors(new.assessment_id, 'ATTEMPT_NEEDS_GRADING', v_count);
  end if;

  return null;
exception
  -- A notification must never abort grading or a submission.
  when others then
    raise warning 'notify_on_attempt_change failed for attempt %: %', new.id, sqlerrm;
    return null;
end;
$$;

revoke execute on function notify_on_attempt_change() from public, anon, authenticated;

create trigger notify_on_attempt_change
  after insert or update of status, graded_at, submitted_at on assessment_attempts
  for each row execute function notify_on_attempt_change();
