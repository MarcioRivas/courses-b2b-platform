-- In-video checkpoint quizzes for YOUTUBE_VIDEO blocks.
--
-- A professor places checkpoints at given seconds of a video; each checkpoint
-- has 1-5 multiple-choice questions (exactly one correct option each) and a
-- minimum number of correct answers to pass. The student player pauses at each
-- checkpoint and only continues once it is passed (enforced in the browser);
-- the database enforces what it can: answers are checked here and the key never
-- leaves it, checkpoints are passed in order, and a video block cannot be
-- completed while any of its checkpoints is pending.
--
-- Every answer is logged (attempt + per-question answers) so professors can see
-- which checkpoint/question students fail most (`video_checkpoint_stats`).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table video_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  block_id uuid not null references lesson_content_blocks (id) on delete cascade,
  at_seconds int not null check (at_seconds between 1 and 43200),
  min_correct int not null check (min_correct >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so a save can swap two checkpoints' times in one transaction.
  constraint video_checkpoints_block_time_key unique (block_id, at_seconds) deferrable initially deferred
);

create index video_checkpoints_block_id_idx on video_checkpoints (block_id);

create table video_checkpoint_questions (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references video_checkpoints (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 1000),
  position int not null check (position > 0),
  constraint video_checkpoint_questions_position_key unique (checkpoint_id, position) deferrable initially deferred
);

create table video_checkpoint_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references video_checkpoint_questions (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 300),
  is_correct boolean not null default false,
  position int not null check (position > 0),
  constraint video_checkpoint_options_position_key unique (question_id, position) deferrable initially deferred
);

create table video_checkpoint_progress (
  enrollment_id uuid not null references course_enrollments (id) on delete cascade,
  checkpoint_id uuid not null references video_checkpoints (id) on delete cascade,
  attempts int not null default 0,
  passed_at timestamptz,
  primary key (enrollment_id, checkpoint_id)
);

create index video_checkpoint_progress_checkpoint_idx on video_checkpoint_progress (checkpoint_id);

create table video_checkpoint_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  enrollment_id uuid not null references course_enrollments (id) on delete cascade,
  checkpoint_id uuid not null references video_checkpoints (id) on delete cascade,
  attempt_number int not null check (attempt_number > 0),
  correct int not null,
  total int not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index video_checkpoint_attempts_checkpoint_idx on video_checkpoint_attempts (checkpoint_id);

create table video_checkpoint_attempt_answers (
  attempt_id uuid not null references video_checkpoint_attempts (id) on delete cascade,
  question_id uuid not null references video_checkpoint_questions (id) on delete cascade,
  -- NULL: unanswered, or the option was deleted by a later edit.
  option_id uuid references video_checkpoint_options (id) on delete set null,
  is_correct boolean not null,
  primary key (attempt_id, question_id)
);

create index video_checkpoint_attempt_answers_question_idx on video_checkpoint_attempt_answers (question_id);
-- Stats count per option, and deleting an option nulls its answers (FK SET NULL).
create index video_checkpoint_attempt_answers_option_idx on video_checkpoint_attempt_answers (option_id);
-- Deleting an enrollment cascades here.
create index video_checkpoint_attempts_enrollment_idx on video_checkpoint_attempts (enrollment_id);

-- ---------------------------------------------------------------------------
-- RLS: editors read the authoring tables directly (the builder); students
-- never touch any of these tables — they go through the RPCs below, which
-- strip the answer key. Progress and the answer log have no client policies.
-- ---------------------------------------------------------------------------
create function video_checkpoint_course(p_checkpoint uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select course_id_of_block(vc.block_id) from video_checkpoints vc where vc.id = p_checkpoint;
$$;

revoke execute on function video_checkpoint_course(uuid) from public, anon;
grant execute on function video_checkpoint_course(uuid) to authenticated;

alter table video_checkpoints enable row level security;
alter table video_checkpoint_questions enable row level security;
alter table video_checkpoint_options enable row level security;
alter table video_checkpoint_progress enable row level security;
alter table video_checkpoint_attempts enable row level security;
alter table video_checkpoint_attempt_answers enable row level security;

create policy video_checkpoints_select on video_checkpoints
  for select to authenticated
  using (coalesce((select can_edit_course(course_id_of_block(block_id))), false));

create policy video_checkpoint_questions_select on video_checkpoint_questions
  for select to authenticated
  using (coalesce((select can_edit_course(video_checkpoint_course(checkpoint_id))), false));

create policy video_checkpoint_options_select on video_checkpoint_options
  for select to authenticated
  using (
    coalesce(
      (select can_edit_course(video_checkpoint_course(q.checkpoint_id))
       from video_checkpoint_questions q where q.id = question_id),
      false
    )
  );

revoke insert, update, delete, truncate on video_checkpoints, video_checkpoint_questions, video_checkpoint_options
  from authenticated;
revoke all on video_checkpoint_progress, video_checkpoint_attempts, video_checkpoint_attempt_answers
  from authenticated;
revoke all on video_checkpoints, video_checkpoint_questions, video_checkpoint_options,
  video_checkpoint_progress, video_checkpoint_attempts, video_checkpoint_attempt_answers
  from anon;

-- ---------------------------------------------------------------------------
-- Completion guard: a video block with checkpoints cannot be completed while
-- any checkpoint is unpassed for that enrollment. A trigger covers every
-- completion path (`complete_content_block`, manual or automatic). DEFINER so
-- it can see the checkpoint rows whoever inserts (fails closed, never skips).
-- ---------------------------------------------------------------------------
create function assert_video_checkpoints_passed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Already completed (e.g. before checkpoints were added): the insert is a
  -- no-op via ON CONFLICT, so do not refuse it.
  if exists (
    select 1 from content_progress cp
    where cp.enrollment_id = new.enrollment_id and cp.content_block_id = new.content_block_id
  ) then
    return new;
  end if;

  if exists (
    select 1
    from video_checkpoints vc
    where vc.block_id = new.content_block_id
      and not exists (
        select 1
        from video_checkpoint_progress p
        where p.checkpoint_id = vc.id
          and p.enrollment_id = new.enrollment_id
          and p.passed_at is not null
      )
  ) then
    raise exception 'CHECKPOINTS_PENDING' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

revoke execute on function assert_video_checkpoints_passed() from public, anon, authenticated;

create trigger content_progress_checkpoint_guard
  before insert on content_progress
  for each row execute function assert_video_checkpoints_passed();

-- ---------------------------------------------------------------------------
-- checkpoint_enrollment_check (internal): the caller owns an ACTIVE-ish
-- enrollment of the lesson's course and the lesson's module is open.
-- ---------------------------------------------------------------------------
create function checkpoint_enrollment_check(p_enrollment uuid, p_lesson uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_module uuid;
  v_course uuid;
  v_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null
     or v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'Not allowed to use this enrollment' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select l.module_id, m.course_id into v_module, v_course
  from lessons l join modules m on m.id = l.module_id
  where l.id = p_lesson;

  if v_course is distinct from v_enrollment.course_id then
    raise exception 'Lesson not found' using errcode = 'no_data_found';
  end if;

  select u.state into v_state from module_unlock_state(p_enrollment) u where u.module_id = v_module;

  if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
    raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
  end if;

  return v_enrollment.organization_id;
end;
$$;

revoke execute on function checkpoint_enrollment_check(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_video_checkpoints: the editor's whole checkpoint set for one block.
--
-- p_checkpoints: [{ id?, atSeconds, minCorrect,
--                   questions: [{ id?, prompt, options: [{ id?, label, isCorrect }] }] }]
-- Upserts by id at every level so kept checkpoints keep student progress and
-- kept questions/options keep their statistics; anything absent is deleted.
-- ---------------------------------------------------------------------------
create function save_video_checkpoints(p_block uuid, p_checkpoints jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_block lesson_content_blocks%rowtype;
  v_course uuid;
  v_org uuid;
  v_cp jsonb;
  v_q jsonb;
  v_o jsonb;
  v_cp_id uuid;
  v_q_id uuid;
  v_o_id uuid;
  v_q_count int;
  v_o_count int;
  v_correct int;
  v_min int;
  v_q_pos int;
  v_o_pos int;
begin
  select * into v_block from lesson_content_blocks where id = p_block;
  v_course := (select course_id_of_block(p_block));

  if v_block.id is null or coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to edit this block' using errcode = 'insufficient_privilege';
  end if;

  if v_block.type <> 'YOUTUBE_VIDEO' then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  select c.organization_id into v_org from courses c where c.id = v_course;

  -- Validate the whole payload before writing anything.
  if jsonb_typeof(coalesce(p_checkpoints, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_checkpoints) > 20
     or (select count(distinct (x ->> 'atSeconds')) from jsonb_array_elements(p_checkpoints) x)
        <> jsonb_array_length(p_checkpoints) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  -- Each id may appear once per level: a duplicated id would silently merge
  -- two items (e.g. leave a question without its correct option).
  if (select count(*) - count(distinct x ->> 'id') from jsonb_array_elements(p_checkpoints) x where x ? 'id') > 0
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q
       where q ? 'id' group by q ->> 'id' having count(*) > 1
     )
     or exists (
       select 1 from jsonb_array_elements(p_checkpoints) c, jsonb_array_elements(c -> 'questions') q,
                     jsonb_array_elements(q -> 'options') o
       where o ? 'id' group by o ->> 'id' having count(*) > 1
     ) then
    raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
  end if;

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    v_q_count := coalesce(jsonb_array_length(v_cp -> 'questions'), 0);
    v_min := (v_cp ->> 'minCorrect')::int;

    if (v_cp ->> 'atSeconds')::int not between 1 and 43200
       or v_q_count not between 1 and 5
       or v_min is null or v_min not between 1 and v_q_count
       or (v_cp ? 'id' and not exists (
             select 1 from video_checkpoints vc where vc.id = (v_cp ->> 'id')::uuid and vc.block_id = p_block)) then
      raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
    end if;

    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_o_count := coalesce(jsonb_array_length(v_q -> 'options'), 0);
      select count(*) filter (where (o ->> 'isCorrect')::boolean) into v_correct
      from jsonb_array_elements(v_q -> 'options') o;

      if char_length(trim(coalesce(v_q ->> 'prompt', ''))) not between 1 and 1000
         or v_o_count not between 2 and 6
         or v_correct <> 1
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where char_length(trim(coalesce(o ->> 'label', ''))) not between 1 and 300
         )
         or (v_q ? 'id' and (not (v_cp ? 'id') or not exists (
               select 1 from video_checkpoint_questions q
               where q.id = (v_q ->> 'id')::uuid and q.checkpoint_id = (v_cp ->> 'id')::uuid)))
         or exists (
           select 1 from jsonb_array_elements(v_q -> 'options') o
           where o ? 'id' and (not (v_q ? 'id') or not exists (
             select 1 from video_checkpoint_options vo
             where vo.id = (o ->> 'id')::uuid and vo.question_id = (v_q ->> 'id')::uuid))
         ) then
        raise exception 'INVALID_CHECKPOINTS' using errcode = 'invalid_parameter_value';
      end if;
    end loop;
  end loop;

  -- Checkpoints no longer present go away (with their progress and stats).
  delete from video_checkpoints vc
  where vc.block_id = p_block
    and vc.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(p_checkpoints) x where x ? 'id'
    );

  for v_cp in select * from jsonb_array_elements(p_checkpoints) loop
    if v_cp ? 'id' then
      v_cp_id := (v_cp ->> 'id')::uuid;
      update video_checkpoints
      set at_seconds = (v_cp ->> 'atSeconds')::int,
          min_correct = (v_cp ->> 'minCorrect')::int,
          updated_at = now()
      where id = v_cp_id;
    else
      insert into video_checkpoints (organization_id, block_id, at_seconds, min_correct)
      values (v_org, p_block, (v_cp ->> 'atSeconds')::int, (v_cp ->> 'minCorrect')::int)
      returning id into v_cp_id;
    end if;

    delete from video_checkpoint_questions q
    where q.checkpoint_id = v_cp_id
      and q.id not in (
        select (x ->> 'id')::uuid from jsonb_array_elements(v_cp -> 'questions') x where x ? 'id'
      );

    v_q_pos := 0;
    for v_q in select * from jsonb_array_elements(v_cp -> 'questions') loop
      v_q_pos := v_q_pos + 1;
      if v_q ? 'id' then
        v_q_id := (v_q ->> 'id')::uuid;
        update video_checkpoint_questions
        set prompt = trim(v_q ->> 'prompt'), position = v_q_pos
        where id = v_q_id;
      else
        insert into video_checkpoint_questions (checkpoint_id, prompt, position)
        values (v_cp_id, trim(v_q ->> 'prompt'), v_q_pos)
        returning id into v_q_id;
      end if;

      delete from video_checkpoint_options vo
      where vo.question_id = v_q_id
        and vo.id not in (
          select (x ->> 'id')::uuid from jsonb_array_elements(v_q -> 'options') x where x ? 'id'
        );

      v_o_pos := 0;
      for v_o in select * from jsonb_array_elements(v_q -> 'options') loop
        v_o_pos := v_o_pos + 1;
        if v_o ? 'id' then
          update video_checkpoint_options
          set label = trim(v_o ->> 'label'),
              is_correct = coalesce((v_o ->> 'isCorrect')::boolean, false),
              position = v_o_pos
          where id = (v_o ->> 'id')::uuid;
        else
          insert into video_checkpoint_options (question_id, label, is_correct, position)
          values (v_q_id, trim(v_o ->> 'label'), coalesce((v_o ->> 'isCorrect')::boolean, false), v_o_pos);
        end if;
      end loop;
    end loop;
  end loop;

  perform log_audit(
    v_org,
    'video_checkpoints.saved',
    'content_block',
    p_block,
    jsonb_build_object('count', jsonb_array_length(p_checkpoints))
  );
end;
$$;

revoke execute on function save_video_checkpoints(uuid, jsonb) from public, anon;
grant execute on function save_video_checkpoints(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- video_checkpoints_for_lesson: the student's view of every checkpointed video
-- in a lesson, keyed by block id. Options are shuffled on every call and the
-- answer key is never included.
-- ---------------------------------------------------------------------------
create function video_checkpoints_for_lesson(p_enrollment uuid, p_lesson uuid)
returns jsonb
language plpgsql
volatile -- shuffles options with random()
security definer
set search_path = public, pg_temp
as $$
begin
  perform checkpoint_enrollment_check(p_enrollment, p_lesson);

  return coalesce((
    select jsonb_object_agg(per_block.block_id, per_block.checkpoints)
    from (
      select
        vc.block_id,
        jsonb_agg(
          jsonb_build_object(
            'id', vc.id,
            'atSeconds', vc.at_seconds,
            'minCorrect', vc.min_correct,
            'passed', p.passed_at is not null,
            'questions', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', q.id,
                  'prompt', q.prompt,
                  'options', (
                    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by random()), '[]'::jsonb)
                    from video_checkpoint_options o
                    where o.question_id = q.id
                  )
                )
                order by q.position
              ), '[]'::jsonb)
              from video_checkpoint_questions q
              where q.checkpoint_id = vc.id
            )
          )
          order by vc.at_seconds
        ) as checkpoints
      from video_checkpoints vc
      join lesson_content_blocks b on b.id = vc.block_id
      left join video_checkpoint_progress p on p.checkpoint_id = vc.id and p.enrollment_id = p_enrollment
      where b.lesson_id = p_lesson
      group by vc.block_id
    ) per_block
  ), '{}'::jsonb);
end;
$$;

revoke execute on function video_checkpoints_for_lesson(uuid, uuid) from public, anon;
grant execute on function video_checkpoints_for_lesson(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- answer_video_checkpoint: checks a set of answers, records the attempt (for
-- statistics) and marks the checkpoint passed when enough are correct.
-- p_answers: [{ questionId, optionId }] — missing questions count as wrong.
-- Returns counts only, never which answers were right.
-- ---------------------------------------------------------------------------
create function answer_video_checkpoint(p_enrollment uuid, p_checkpoint uuid, p_answers jsonb)
returns table (passed boolean, correct int, total int, min_correct int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cp video_checkpoints%rowtype;
  v_lesson uuid;
  v_org uuid;
  v_total int;
  v_correct int;
  v_passed boolean;
  v_attempts int;
  v_attempt_id uuid;
begin
  select * into v_cp from video_checkpoints vc where vc.id = p_checkpoint;
  select b.lesson_id into v_lesson from lesson_content_blocks b where b.id = v_cp.block_id;

  if v_cp.id is null then
    raise exception 'Checkpoint not found' using errcode = 'no_data_found';
  end if;

  v_org := checkpoint_enrollment_check(p_enrollment, v_lesson);

  -- Lock order matches every progress writer: enrollment first.
  perform 1 from course_enrollments e where e.id = p_enrollment for update;

  if exists (
    select 1 from video_checkpoint_progress p
    where p.enrollment_id = p_enrollment and p.checkpoint_id = p_checkpoint and p.passed_at is not null
  ) then
    select count(*)::int into v_total from video_checkpoint_questions q where q.checkpoint_id = p_checkpoint;
    return query select true, v_total, v_total, v_cp.min_correct;
    return;
  end if;

  if exists (
    select 1 from video_checkpoints earlier
    where earlier.block_id = v_cp.block_id
      and earlier.at_seconds < v_cp.at_seconds
      and not exists (
        select 1 from video_checkpoint_progress p
        where p.checkpoint_id = earlier.id and p.enrollment_id = p_enrollment and p.passed_at is not null
      )
  ) then
    raise exception 'CHECKPOINT_ORDER' using errcode = 'invalid_parameter_value';
  end if;

  -- Answers: an array, each question of this checkpoint at most once, each
  -- option (when given) belonging to its question.
  if jsonb_typeof(coalesce(p_answers, 'null'::jsonb)) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(p_answers) a
       where not exists (
         select 1 from video_checkpoint_questions q
         where q.id = (a ->> 'questionId')::uuid and q.checkpoint_id = p_checkpoint
       )
       or (a ->> 'optionId' is not null and not exists (
         select 1 from video_checkpoint_options o
         where o.id = (a ->> 'optionId')::uuid and o.question_id = (a ->> 'questionId')::uuid
       ))
     )
     or (select count(distinct a ->> 'questionId') from jsonb_array_elements(p_answers) a)
        <> jsonb_array_length(p_answers) then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  select count(*)::int into v_total from video_checkpoint_questions q where q.checkpoint_id = p_checkpoint;

  select count(*)::int into v_correct
  from jsonb_array_elements(p_answers) a
  join video_checkpoint_options o on o.id = (a ->> 'optionId')::uuid
  where o.is_correct;

  v_passed := v_correct >= v_cp.min_correct;

  insert into video_checkpoint_progress as p (enrollment_id, checkpoint_id, attempts, passed_at)
  values (p_enrollment, p_checkpoint, 1, case when v_passed then now() end)
  on conflict (enrollment_id, checkpoint_id) do update
  set attempts = p.attempts + 1,
      passed_at = coalesce(p.passed_at, excluded.passed_at)
  returning p.attempts into v_attempts;

  insert into video_checkpoint_attempts (
    organization_id, enrollment_id, checkpoint_id, attempt_number, correct, total, passed
  )
  values (v_org, p_enrollment, p_checkpoint, v_attempts, v_correct, v_total, v_passed)
  returning id into v_attempt_id;

  insert into video_checkpoint_attempt_answers (attempt_id, question_id, option_id, is_correct)
  select v_attempt_id, q.id, o.id, coalesce(o.is_correct, false)
  from video_checkpoint_questions q
  left join jsonb_array_elements(p_answers) a on (a ->> 'questionId')::uuid = q.id
  left join video_checkpoint_options o on o.id = (a ->> 'optionId')::uuid
  where q.checkpoint_id = p_checkpoint;

  return query select v_passed, v_correct, v_total, v_cp.min_correct;
end;
$$;

revoke execute on function answer_video_checkpoint(uuid, uuid, jsonb) from public, anon;
grant execute on function answer_video_checkpoint(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- video_checkpoint_stats: aggregate results for one video block, for its
-- editors (course professors / org admins). CANCELLED enrollments excluded.
-- ---------------------------------------------------------------------------
create function video_checkpoint_stats(p_block uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
begin
  v_course := (select course_id_of_block(p_block));

  if v_course is null or coalesce((select can_edit_course(v_course)), false) is not true then
    raise exception 'Not allowed to read these statistics' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'enrolledCount', (
      select count(*) from course_enrollments e where e.course_id = v_course and e.status <> 'CANCELLED'
    ),
    'checkpoints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', vc.id,
          'atSeconds', vc.at_seconds,
          'minCorrect', vc.min_correct,
          'reached', (
            select count(distinct a.enrollment_id) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
            where a.checkpoint_id = vc.id
          ),
          'passed', (
            select count(*) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED'
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'totalAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
            where a.checkpoint_id = vc.id
          ),
          'failedAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
            where a.checkpoint_id = vc.id and not a.passed
          ),
          'firstTryAttempts', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
            where a.checkpoint_id = vc.id and a.attempt_number = 1
          ),
          'firstTryPassed', (
            select count(*) from video_checkpoint_attempts a
            join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
            where a.checkpoint_id = vc.id and a.attempt_number = 1 and a.passed
          ),
          'avgAttemptsToPass', (
            select round(avg(p.attempts), 1) from video_checkpoint_progress p
            join course_enrollments e on e.id = p.enrollment_id and e.status <> 'CANCELLED'
            where p.checkpoint_id = vc.id and p.passed_at is not null
          ),
          'questions', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id', q.id,
                'prompt', q.prompt,
                'answers', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
                  where aa.question_id = q.id
                ),
                'wrong', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
                  where aa.question_id = q.id and not aa.is_correct
                ),
                'unanswered', (
                  select count(*) from video_checkpoint_attempt_answers aa
                  join video_checkpoint_attempts a on a.id = aa.attempt_id
                  join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
                  where aa.question_id = q.id and aa.option_id is null
                ),
                'options', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'id', o.id,
                      'label', o.label,
                      'isCorrect', o.is_correct,
                      'chosen', (
                        select count(*) from video_checkpoint_attempt_answers aa
                        join video_checkpoint_attempts a on a.id = aa.attempt_id
                        join course_enrollments e on e.id = a.enrollment_id and e.status <> 'CANCELLED'
                        where aa.option_id = o.id
                      )
                    )
                    order by o.position
                  ), '[]'::jsonb)
                  from video_checkpoint_options o
                  where o.question_id = q.id
                )
              )
              order by q.position
            ), '[]'::jsonb)
            from video_checkpoint_questions q
            where q.checkpoint_id = vc.id
          )
        )
        order by vc.at_seconds
      )
      from video_checkpoints vc
      where vc.block_id = p_block
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function video_checkpoint_stats(uuid) from public, anon;
grant execute on function video_checkpoint_stats(uuid) to authenticated;
