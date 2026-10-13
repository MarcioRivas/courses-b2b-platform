-- Inline assessments: question banks are gone. Every question belongs to
-- exactly one assessment, QUIZ/TASK assessments are owned by exactly one
-- content block (created together, deleted together), and copying an edition
-- deep-copies questions instead of sharing them.
--
-- Existing bank/question rows are discarded (pre-production data).

-- ---------------------------------------------------------------------------
-- 1. Drop the bank layer
-- ---------------------------------------------------------------------------
drop trigger if exists assert_question_not_in_use_elsewhere on questions;
drop trigger if exists assert_question_not_in_use_elsewhere on question_options;
drop function if exists assert_question_not_in_use_elsewhere();

drop trigger if exists assessment_questions_task_guard on assessment_questions;
drop function if exists assert_task_has_no_questions();

drop function if exists set_assessment_questions(uuid, jsonb);
drop function if exists replace_question_options(uuid, jsonb);

drop table assessment_questions;

drop policy if exists questions_all on questions;
drop policy if exists question_options_all on question_options;
drop policy if exists question_banks_all on question_banks;

alter table assessments drop constraint assessments_random_needs_bank_check;
alter table assessments drop constraint assessments_task_shape_check;
alter table assessments drop column question_bank_id;

-- Same rule as before minus the bank column: a TASK has files, a deadline,
-- no duration and no random draw.
alter table assessments
  add constraint assessments_task_shape_check check (
    (kind = 'TASK') = (max_files is not null)
    and (
      kind <> 'TASK'
      or (
        available_until is not null
        and duration_seconds is null
        and random_question_count is null
      )
    )
  );

-- Attempt snapshots keep pointing at the source question only as a hint: the
-- snapshot is self-contained, so deleting a question must not be blocked by
-- (nor break) attempts that already copied it.
alter table assessment_attempt_questions
  drop constraint assessment_attempt_questions_question_id_fkey,
  alter column question_id drop not null,
  add constraint assessment_attempt_questions_question_id_fkey
    foreign key (question_id) references questions (id) on delete set null;

-- DELETE, not TRUNCATE: snapshots reference questions (now SET NULL).
delete from question_options;
delete from questions;

drop index if exists questions_bank_active_idx;
drop index if exists questions_organization_id_idx;

alter table questions
  drop column question_bank_id,
  drop column organization_id,
  drop column is_active,
  drop column created_by;

drop function if exists question_bank_id_of_question(uuid);
drop function if exists can_edit_question_bank(uuid);
drop table question_banks;

-- ---------------------------------------------------------------------------
-- 2. Questions belong to one assessment
-- ---------------------------------------------------------------------------
alter table questions rename column default_points to points;

alter table questions
  add column assessment_id uuid not null references assessments (id) on delete cascade,
  add column position int not null,
  add constraint questions_assessment_position_key unique (assessment_id, position) deferrable initially deferred;

create index questions_assessment_id_idx on questions (assessment_id);

create function assert_question_assessment_has_questions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from assessments where id = new.assessment_id and kind = 'TASK') then
    raise exception 'TASK_HAS_NO_QUESTIONS' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger questions_task_guard
  before insert or update of assessment_id on questions
  for each row execute function assert_question_assessment_has_questions();

revoke execute on function assert_question_assessment_has_questions() from public, anon, authenticated;

create function offering_id_of_question(p_question uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.offering_id
  from questions q
  join assessments a on a.id = q.assessment_id
  where q.id = p_question;
$$;

revoke execute on function offering_id_of_question(uuid) from public, anon;
grant execute on function offering_id_of_question(uuid) to authenticated;

-- Staff of the edition only. Students have NO policy on either table: they
-- read the attempt snapshot, never a question or an answer key (C8).
create policy questions_all on questions
  for all to authenticated
  using ((select can_edit_offering((select offering_id_of_assessment(assessment_id)))))
  with check ((select can_edit_offering((select offering_id_of_assessment(assessment_id)))));

create policy question_options_all on question_options
  for all to authenticated
  using ((select can_edit_offering((select offering_id_of_question(question_id)))))
  with check ((select can_edit_offering((select offering_id_of_question(question_id)))));

-- ---------------------------------------------------------------------------
-- 3. One block owns one assessment, of the matching kind. EXAM never lives in
--    a block.
-- ---------------------------------------------------------------------------
alter table lesson_content_blocks
  add constraint lesson_content_blocks_assessment_id_key unique (assessment_id);

create function assert_block_assessment_kind()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.assessment_id is not null
     and not exists (
       select 1 from assessments a
       where a.id = new.assessment_id and a.kind::text = new.type::text
     ) then
    raise exception 'BLOCK_ASSESSMENT_KIND_MISMATCH' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger assert_block_assessment_kind
  before insert or update of assessment_id, type on lesson_content_blocks
  for each row execute function assert_block_assessment_kind();

revoke execute on function assert_block_assessment_kind() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_assessment_block: a QUIZ/TASK and its block are born together, so
--    the wizard's first step can never leave an orphan assessment behind.
--
-- p_config: { title, description?, passingScore, maxAttempts?, availableFrom?,
--             availableUntil?, maxFiles?, allowLateSubmissions?, instructions? }
-- ---------------------------------------------------------------------------
create function create_assessment_block(
  p_lesson uuid,
  p_kind assessment_kind,
  p_is_required boolean,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
  v_org uuid;
  v_title text;
  v_assessment_id uuid;
  v_block_id uuid;
begin
  v_offering := (select offering_id_of_lesson(p_lesson));

  if v_offering is null then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('QUIZ', 'TASK') then
    raise exception 'INVALID_ASSESSMENT_KIND' using errcode = 'invalid_parameter_value';
  end if;

  v_title := btrim(coalesce(p_config ->> 'title', ''));
  if char_length(v_title) not between 2 and 150 then
    raise exception 'INVALID_ASSESSMENT' using errcode = 'invalid_parameter_value';
  end if;

  select organization_id into v_org from course_offerings where id = v_offering;

  -- Table checks enforce the per-kind shape (TASK deadline/files, windows).
  insert into assessments (
    organization_id, offering_id, module_id, kind, title, description, passing_score,
    max_attempts, available_from, available_until, max_files,
    allow_late_submissions, instructions, created_by
  )
  values (
    v_org,
    v_offering,
    (select module_id from lessons where id = p_lesson),
    p_kind,
    v_title,
    nullif(btrim(coalesce(p_config ->> 'description', '')), ''),
    (p_config ->> 'passingScore')::int,
    (p_config ->> 'maxAttempts')::int,
    (p_config ->> 'availableFrom')::timestamptz,
    (p_config ->> 'availableUntil')::timestamptz,
    case when p_kind = 'TASK' then (p_config ->> 'maxFiles')::int end,
    p_kind = 'TASK' and coalesce((p_config ->> 'allowLateSubmissions')::boolean, false),
    nullif(btrim(coalesce(p_config ->> 'instructions', '')), ''),
    auth.uid()
  )
  returning id into v_assessment_id;

  insert into lesson_content_blocks (lesson_id, type, position, data, assessment_id, is_required)
  values (
    p_lesson,
    p_kind::text::content_block_type,
    coalesce((select max(position) from lesson_content_blocks where lesson_id = p_lesson), 0) + 1,
    '{}'::jsonb,
    v_assessment_id,
    coalesce(p_is_required, true)
  )
  returning id into v_block_id;

  perform log_audit(
    v_org, 'assessment.created', 'assessment', v_assessment_id,
    jsonb_build_object('offeringId', v_offering, 'kind', p_kind)
  );
  perform log_audit(
    v_org, 'content_block.created', 'content_block', v_block_id,
    jsonb_build_object('type', p_kind, 'lessonId', p_lesson)
  );

  return jsonb_build_object('blockId', v_block_id, 'assessmentId', v_assessment_id);
end;
$$;

revoke execute on function create_assessment_block(uuid, assessment_kind, boolean, jsonb) from public, anon;
grant execute on function create_assessment_block(uuid, assessment_kind, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. save_assessment_questions: replace an assessment's whole question list
--    in one transaction. Questions are diffed by id (kept ids keep their
--    row); options are replaced wholesale — nothing references them except
--    attempt snapshots, which hold their own copies.
--
-- p_questions: [{ id?, type, prompt, points, options?: [{ label, isCorrect }] }]
--              in display order.
-- p_random_count: NULL = every student gets every question; N = a random N.
-- Returns the question ids in display order (the client rebases its drafts).
-- ---------------------------------------------------------------------------
create function save_assessment_questions(p_assessment uuid, p_questions jsonb, p_random_count int default null)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
  v_count int;
  v_q jsonb;
  v_q_id uuid;
  v_pos int := 0;
  v_ids uuid[] := '{}';
begin
  select * into v_assessment from assessments where id = p_assessment for update;

  if v_assessment.id is null then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_assessment.offering_id)), false) is not true then
    raise exception 'Not allowed to edit this assessment' using errcode = 'insufficient_privilege';
  end if;

  if v_assessment.kind = 'TASK' then
    raise exception 'TASK_HAS_NO_QUESTIONS' using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_typeof(coalesce(p_questions, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_QUESTIONS' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_questions);

  if v_count > 200
     or (v_count = 0 and v_assessment.status = 'PUBLISHED')
     or (p_random_count is not null and (p_random_count < 1 or p_random_count > v_count)) then
    raise exception 'INVALID_QUESTIONS' using errcode = 'invalid_parameter_value';
  end if;

  -- Validate the whole payload before writing anything.
  if (select count(*) - count(distinct x ->> 'id') from jsonb_array_elements(p_questions) x where x ? 'id') > 0 then
    raise exception 'INVALID_QUESTIONS' using errcode = 'invalid_parameter_value';
  end if;

  for v_q in select * from jsonb_array_elements(p_questions) loop
    if coalesce(v_q ->> 'type', '') not in ('MULTIPLE_CHOICE', 'OPEN_ENDED')
       or char_length(btrim(coalesce(v_q ->> 'prompt', ''))) not between 2 and 4000
       or coalesce((v_q ->> 'points')::numeric, 0) <= 0
       or (v_q ->> 'points')::numeric > 1000
       or (v_q ? 'id' and not exists (
             select 1 from questions q where q.id = (v_q ->> 'id')::uuid and q.assessment_id = p_assessment))
    then
      raise exception 'INVALID_QUESTIONS' using errcode = 'invalid_parameter_value';
    end if;

    if v_q ->> 'type' = 'MULTIPLE_CHOICE' and (
         jsonb_typeof(coalesce(v_q -> 'options', 'null'::jsonb)) <> 'array'
         or jsonb_array_length(v_q -> 'options') not between 2 and 6
         or (select count(*) from jsonb_array_elements(v_q -> 'options') o
             where coalesce((o ->> 'isCorrect')::boolean, false)) <> 1
         or exists (select 1 from jsonb_array_elements(v_q -> 'options') o
                    where char_length(btrim(coalesce(o ->> 'label', ''))) not between 1 and 300)
       ) then
      raise exception 'INVALID_QUESTIONS' using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  delete from questions q
  where q.assessment_id = p_assessment
    and q.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(p_questions) x where x ? 'id'
    );

  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_pos := v_pos + 1;

    if v_q ? 'id' then
      v_q_id := (v_q ->> 'id')::uuid;
      update questions
      set type = (v_q ->> 'type')::question_type,
          prompt = btrim(v_q ->> 'prompt'),
          points = (v_q ->> 'points')::numeric,
          position = v_pos
      where id = v_q_id;
    else
      insert into questions (assessment_id, type, prompt, points, position)
      values (
        p_assessment,
        (v_q ->> 'type')::question_type,
        btrim(v_q ->> 'prompt'),
        (v_q ->> 'points')::numeric,
        v_pos
      )
      returning id into v_q_id;
    end if;

    delete from question_options where question_id = v_q_id;

    if v_q ->> 'type' = 'MULTIPLE_CHOICE' then
      insert into question_options (question_id, label, position, is_correct)
      select v_q_id, btrim(o.value ->> 'label'), o.ordinality::int, coalesce((o.value ->> 'isCorrect')::boolean, false)
      from jsonb_array_elements(v_q -> 'options') with ordinality as o(value, ordinality);
    end if;

    v_ids := v_ids || v_q_id;
  end loop;

  update assessments set random_question_count = p_random_count where id = p_assessment;

  perform log_audit(
    v_assessment.organization_id,
    'assessment.questions_saved',
    'assessment',
    p_assessment,
    jsonb_build_object('count', v_count, 'randomCount', p_random_count)
  );

  return v_ids;
end;
$$;

revoke execute on function save_assessment_questions(uuid, jsonb, int) from public, anon;
grant execute on function save_assessment_questions(uuid, jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. start_attempt: the snapshot draws from the assessment's own questions.
--    Only the selection block changed; every gate is as before.
-- ---------------------------------------------------------------------------
create or replace function start_attempt(p_enrollment uuid, p_assessment uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- FOR SHARE: a concurrent save_assessment_questions (FOR UPDATE) waits, so
  -- the snapshot never sees a half-rewritten question list.
  select * into v_assessment from assessments where id = p_assessment for share;

  if v_assessment.id is null or v_assessment.offering_id <> v_enrollment.offering_id then
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

  -- Snapshot. Every question of the assessment, or a random N of them when
  -- `random_question_count` is set. An EXAM shuffles; a QUIZ keeps the
  -- author's order among the questions it got (D34).
  for v_question in
    with pool as (
      select q.id, q.type, q.prompt, q.points, q.position
      from questions q
      where q.assessment_id = p_assessment
      order by case when v_assessment.random_question_count is null then q.position end, random()
      limit coalesce(v_assessment.random_question_count, 200)
    )
    select * from pool p
    order by case when v_assessment.kind = 'EXAM' then random() else p.position end
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

  -- A published assessment whose questions were all removed afterwards.
  if v_position = 0 then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = 'invalid_parameter_value';
  end if;

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
$function$;

-- ---------------------------------------------------------------------------
-- 7. copy_edition_content: questions and options are deep-copied with the
--    assessment (a new edition never shares a question with its source).
-- ---------------------------------------------------------------------------
create or replace function copy_edition_content(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src course_offerings%rowtype;
  v_tgt course_offerings%rowtype;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'COPY_INVALID' using errcode = 'invalid_parameter_value';
  end if;

  -- Both rows locked in id order: two concurrent copies cannot deadlock.
  perform 1 from course_offerings where id in (p_source, p_target) order by id for update;

  select * into v_src from course_offerings where id = p_source;
  select * into v_tgt from course_offerings where id = p_target;

  if v_src.id is null or v_tgt.id is null then
    raise exception 'Offering not found' using errcode = 'no_data_found';
  end if;

  if v_tgt.status = 'CANCELLED' then
    raise exception 'TARGET_CANCELLED' using errcode = 'restrict_violation';
  end if;

  if v_src.course_id <> v_tgt.course_id then
    raise exception 'COPY_DIFFERENT_COURSE' using errcode = 'invalid_parameter_value';
  end if;

  if exists (select 1 from modules where offering_id = p_target)
     or exists (select 1 from assessments where offering_id = p_target) then
    raise exception 'TARGET_NOT_EMPTY' using errcode = 'restrict_violation';
  end if;

  drop table if exists pg_temp._copy_map;
  create temp table _copy_map (
    kind text not null,
    old_id uuid not null,
    new_id uuid not null,
    primary key (kind, old_id)
  );

  insert into _copy_map
  select 'module', m.id, gen_random_uuid() from modules m where m.offering_id = p_source;

  insert into _copy_map
  select 'lesson', l.id, gen_random_uuid()
  from lessons l join _copy_map c on c.kind = 'module' and c.old_id = l.module_id;

  insert into _copy_map
  select 'block', b.id, gen_random_uuid()
  from lesson_content_blocks b join _copy_map c on c.kind = 'lesson' and c.old_id = b.lesson_id;

  insert into _copy_map
  select 'assessment', a.id, gen_random_uuid() from assessments a where a.offering_id = p_source;

  insert into _copy_map
  select 'question', q.id, gen_random_uuid()
  from questions q join _copy_map c on c.kind = 'assessment' and c.old_id = q.assessment_id;

  insert into _copy_map
  select 'checkpoint', vc.id, gen_random_uuid()
  from video_checkpoints vc join _copy_map c on c.kind = 'block' and c.old_id = vc.block_id;

  insert into _copy_map
  select 'cp_question', q.id, gen_random_uuid()
  from video_checkpoint_questions q join _copy_map c on c.kind = 'checkpoint' and c.old_id = q.checkpoint_id;

  insert into _copy_map
  select 'cp_option', o.id, gen_random_uuid()
  from video_checkpoint_options o join _copy_map c on c.kind = 'cp_question' and c.old_id = o.question_id;

  insert into modules (id, offering_id, title, description, position)
  select c.new_id, p_target, m.title, m.description, m.position
  from modules m join _copy_map c on c.kind = 'module' and c.old_id = m.id;

  insert into lessons (id, module_id, title, description, position)
  select c.new_id, cm.new_id, l.title, l.description, l.position
  from lessons l
  join _copy_map c on c.kind = 'lesson' and c.old_id = l.id
  join _copy_map cm on cm.kind = 'module' and cm.old_id = l.module_id;

  -- Evaluations keep their dates (the EXAM / TASK checks need them) but are
  -- forced to DRAFT: nothing goes live by accident.
  insert into assessments (
    id, organization_id, offering_id, module_id, kind, status, title, description,
    random_question_count, duration_seconds, available_from,
    available_until, passing_score, max_attempts, created_by, instructions,
    max_files, allow_late_submissions
  )
  select
    c.new_id, a.organization_id, p_target, cm.new_id, a.kind, 'DRAFT', a.title, a.description,
    a.random_question_count, a.duration_seconds, a.available_from,
    a.available_until, a.passing_score, a.max_attempts, a.created_by, a.instructions,
    a.max_files, a.allow_late_submissions
  from assessments a
  join _copy_map c on c.kind = 'assessment' and c.old_id = a.id
  left join _copy_map cm on cm.kind = 'module' and cm.old_id = a.module_id;

  insert into questions (id, assessment_id, type, prompt, points, position)
  select c.new_id, ca.new_id, q.type, q.prompt, q.points, q.position
  from questions q
  join _copy_map c on c.kind = 'question' and c.old_id = q.id
  join _copy_map ca on ca.kind = 'assessment' and ca.old_id = q.assessment_id;

  insert into question_options (question_id, label, position, is_correct)
  select cq.new_id, o.label, o.position, o.is_correct
  from question_options o
  join _copy_map cq on cq.kind = 'question' and cq.old_id = o.question_id;

  insert into lesson_content_blocks (id, lesson_id, type, position, data, assessment_id, is_required)
  select c.new_id, cl.new_id, b.type, b.position, b.data, ca.new_id, b.is_required
  from lesson_content_blocks b
  join _copy_map c on c.kind = 'block' and c.old_id = b.id
  join _copy_map cl on cl.kind = 'lesson' and cl.old_id = b.lesson_id
  left join _copy_map ca on ca.kind = 'assessment' and ca.old_id = b.assessment_id;

  insert into module_dependencies (module_id, condition, depends_on_module_id, assessment_id, min_score)
  select cm.new_id, d.condition, cd.new_id, ca.new_id, d.min_score
  from module_dependencies d
  join _copy_map cm on cm.kind = 'module' and cm.old_id = d.module_id
  left join _copy_map cd on cd.kind = 'module' and cd.old_id = d.depends_on_module_id
  left join _copy_map ca on ca.kind = 'assessment' and ca.old_id = d.assessment_id;

  insert into video_checkpoints (id, organization_id, block_id, at_seconds, min_correct)
  select c.new_id, vc.organization_id, cb.new_id, vc.at_seconds, vc.min_correct
  from video_checkpoints vc
  join _copy_map c on c.kind = 'checkpoint' and c.old_id = vc.id
  join _copy_map cb on cb.kind = 'block' and cb.old_id = vc.block_id;

  insert into video_checkpoint_questions (id, checkpoint_id, prompt, position)
  select c.new_id, cp.new_id, q.prompt, q.position
  from video_checkpoint_questions q
  join _copy_map c on c.kind = 'cp_question' and c.old_id = q.id
  join _copy_map cp on cp.kind = 'checkpoint' and cp.old_id = q.checkpoint_id;

  insert into video_checkpoint_options (id, question_id, label, is_correct, position)
  select c.new_id, cq.new_id, o.label, o.is_correct, o.position
  from video_checkpoint_options o
  join _copy_map c on c.kind = 'cp_option' and c.old_id = o.id
  join _copy_map cq on cq.kind = 'cp_question' and cq.old_id = o.question_id;

  drop table pg_temp._copy_map;

  -- Same-edition invariants.
  if exists (
    select 1
    from modules tm
    join lessons tl on tl.module_id = tm.id
    join lesson_content_blocks b on b.lesson_id = tl.id
    where tm.offering_id = p_target
      and b.assessment_id is not null
      and offering_id_of_assessment(b.assessment_id) is distinct from p_target
  ) or exists (
    select 1
    from modules tm
    join module_dependencies d on d.module_id = tm.id
    where tm.offering_id = p_target
      and (
        offering_id_of_module(d.depends_on_module_id) is distinct from p_target and d.depends_on_module_id is not null
        or offering_id_of_assessment(d.assessment_id) is distinct from p_target and d.assessment_id is not null
      )
  ) then
    raise exception 'COPY_INVARIANT' using errcode = 'invalid_parameter_value';
  end if;

  perform refresh_offering_enrollment_totals(p_target);
end;
$$;

revoke execute on function copy_edition_content(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. delete_content_block: a QUIZ/TASK block takes its assessment with it.
--    Refused while students have attempts (their grades live there).
-- ---------------------------------------------------------------------------
create or replace function delete_content_block(p_block uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering uuid;
  v_assessment uuid;
begin
  v_offering := (select offering_id_of_block(p_block));

  if v_offering is null then
    raise exception 'Block not found' using errcode = 'no_data_found';
  end if;

  if coalesce((select can_edit_offering(v_offering)), false) is not true then
    raise exception 'Not allowed to edit this edition' using errcode = 'insufficient_privilege';
  end if;

  select assessment_id into v_assessment from lesson_content_blocks where id = p_block;

  if v_assessment is not null
     and exists (select 1 from assessment_attempts where assessment_id = v_assessment) then
    raise exception 'CONFLICT_HAS_ATTEMPTS' using errcode = 'restrict_violation';
  end if;

  -- Deleting the quiz would silently drop "pass this quiz" unlock conditions.
  if v_assessment is not null
     and exists (select 1 from module_dependencies where assessment_id = v_assessment) then
    raise exception 'CONFLICT_HAS_DEPENDENCIES' using errcode = 'restrict_violation';
  end if;

  if exists (select 1 from content_progress where content_block_id = p_block) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  -- The block's assessment goes with it (trigger `delete_block_assessment`).
  delete from lesson_content_blocks where id = p_block;

  perform refresh_offering_enrollment_totals(v_offering);
end;
$$;

revoke execute on function delete_content_block(uuid) from public, anon;
grant execute on function delete_content_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. A QUIZ/TASK assessment lives and dies with its block — whichever path
--    removes the block (block, lesson or module delete). Attempts are guarded
--    before getting here (delete_content_block / assert_subtree_deletable);
--    if one slipped through, the attempts RESTRICT FK aborts the delete.
-- ---------------------------------------------------------------------------
create function delete_block_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment assessments%rowtype;
begin
  delete from assessments where id = old.assessment_id returning * into v_assessment;
  if v_assessment.id is not null and auth.uid() is not null then
    perform log_audit(
      v_assessment.organization_id, 'assessment.deleted', 'assessment', v_assessment.id,
      jsonb_build_object('title', v_assessment.title, 'blockId', old.id)
    );
  end if;
  return old;
end;
$$;

create trigger delete_block_assessment
  after delete on lesson_content_blocks
  for each row when (old.assessment_id is not null)
  execute function delete_block_assessment();

revoke execute on function delete_block_assessment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. assert_subtree_deletable: also sees inline assessments through their
--     blocks, and refuses when a quiz inside the subtree gates a module
--     outside it (its unlock condition would vanish silently).
-- ---------------------------------------------------------------------------
create or replace function assert_subtree_deletable(p_offering uuid, p_module uuid, p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status course_status;
  v_has_active_enrollments boolean;
begin
  select c.status into v_status
  from course_offerings o
  join courses c on c.id = o.course_id
  where o.id = p_offering;

  select exists (
    select 1 from course_enrollments
    where offering_id = p_offering and status = 'ACTIVE'
  ) into v_has_active_enrollments;

  if v_status = 'PUBLISHED' and v_has_active_enrollments then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
    from content_progress cp
    join lesson_content_blocks b on b.id = cp.content_block_id
    join lessons l on l.id = b.lesson_id
    where (p_module is not null and l.module_id = p_module)
       or (p_lesson is not null and b.lesson_id = p_lesson)
  ) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  -- Assessments in the subtree: module-attached ones plus every block-owned one.
  if exists (
    select 1
    from assessment_attempts t
    join assessments a on a.id = t.assessment_id
    join modules m on m.id = a.module_id
    where m.offering_id = p_offering
      and (p_module is null or m.id = p_module)
  ) or exists (
    select 1
    from assessment_attempts t
    join lesson_content_blocks b on b.assessment_id = t.assessment_id
    join lessons l on l.id = b.lesson_id
    where (p_module is not null and l.module_id = p_module)
       or (p_lesson is not null and b.lesson_id = p_lesson)
  ) then
    raise exception 'CONTENT_IN_USE' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join module_dependencies d on d.assessment_id = b.assessment_id
    where ((p_module is not null and l.module_id = p_module)
        or (p_lesson is not null and b.lesson_id = p_lesson))
      and d.module_id is distinct from p_module
  ) then
    raise exception 'CONFLICT_HAS_DEPENDENCIES' using errcode = 'restrict_violation';
  end if;
end;
$$;

revoke execute on function assert_subtree_deletable(uuid, uuid, uuid) from public, anon, authenticated;
