-- TASK file submissions.
--
-- A TASK no longer has questions: it is an instruction (`instructions`) plus a
-- file submission. Each enrollment gets at most one attempt row for a TASK,
-- created directly as SUBMITTED by `submit_task` (no IN_PROGRESS, no timer, no
-- session lock). Reusing `assessment_attempts` keeps the grading queue, score
-- scale, result screens, analytics and audit working unchanged.
--
-- Rules:
--   * The deadline (`available_until`) is mandatory for a TASK.
--   * Before the deadline the student may submit and replace freely.
--   * After the deadline, only when `allow_late_submissions` is on: a student
--     with no submission may submit late, and may replace a late submission
--     until it is graded. An on-time submission is frozen at the deadline.
--   * Grading is only possible once the deadline has passed.
--
-- Files live in the private `task-submissions` bucket with NO storage policies
-- at all: uploads go through server-minted signed upload URLs (after
-- `task_submission_slot` passes) and downloads through server-minted signed
-- URLs (after `task_file_for_download` passes).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table assessments
  add column instructions text check (char_length(instructions) <= 10000),
  add column max_files int check (max_files between 1 and 10),
  add column allow_late_submissions boolean not null default false;

alter table assessment_attempts
  add column submitted_late boolean not null default false;

-- Existing TASKs (dev data only, MVP not deployed) are reshaped so the new
-- constraint holds: no questions, no timer, a deadline and one file.
delete from assessment_questions aq
using assessments a
where a.id = aq.assessment_id and a.kind = 'TASK';

update assessments
set max_files = 1,
    available_until = coalesce(available_until, now() + interval '30 days'),
    available_from = case
      when available_from is not null and available_from >= coalesce(available_until, now() + interval '30 days')
        then null
      else available_from
    end,
    duration_seconds = null,
    question_bank_id = null,
    random_question_count = null
where kind = 'TASK';

alter table assessments
  add constraint assessments_task_shape_check check (
    (kind = 'TASK') = (max_files is not null)
    and (
      kind <> 'TASK'
      or (
        available_until is not null
        and duration_seconds is null
        and question_bank_id is null
        and random_question_count is null
      )
    )
  ),
  add constraint assessments_late_only_task_check check (
    kind = 'TASK' or allow_late_submissions = false
  );

create table assessment_submission_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  attempt_id uuid not null references assessment_attempts (id) on delete cascade,
  storage_path text not null unique,
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  position int not null check (position > 0),
  created_at timestamptz not null default now(),
  unique (attempt_id, position)
);

create index assessment_submission_files_org_idx on assessment_submission_files (organization_id);

alter table assessment_submission_files enable row level security;

-- Graders (course professors, org admins) read the rows directly; students go
-- through `my_task_submission`, like every other attempt read.
create policy assessment_submission_files_select on assessment_submission_files
  for select to authenticated
  using ((select can_grade_attempt(attempt_id)));

revoke insert, update, delete, truncate on assessment_submission_files from authenticated;
revoke all on assessment_submission_files from anon;

-- ---------------------------------------------------------------------------
-- Guards: a TASK can never get questions nor a timed (IN_PROGRESS) attempt.
-- Triggers instead of re-creating `start_attempt` / `set_assessment_questions`
-- keep a single copy of those long functions.
-- ---------------------------------------------------------------------------
create function assert_task_has_no_questions()
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

create trigger assessment_questions_task_guard
  before insert or update on assessment_questions
  for each row execute function assert_task_has_no_questions();

create function assert_task_attempt_shape()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'IN_PROGRESS'
     and exists (select 1 from assessments where id = new.assessment_id and kind = 'TASK') then
    raise exception 'USE_TASK_SUBMISSION' using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

create trigger assessment_attempts_task_guard
  before insert on assessment_attempts
  for each row execute function assert_task_attempt_shape();

revoke execute on function assert_task_has_no_questions() from public, anon, authenticated;
revoke execute on function assert_task_attempt_shape() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-submissions',
  'task-submissions',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- task_file_mime_for_name: the one MIME type a filename's extension may carry.
-- Mirrors TASK_FILE_TYPES in src/lib/storage/task-submission-file-path.ts.
-- ---------------------------------------------------------------------------
create function task_file_mime_for_name(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(substring(p_name from '\.([^./]+)$'))
    when 'pdf' then 'application/pdf'
    when 'png' then 'image/png'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'webp' then 'image/webp'
    when 'doc' then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls' then 'application/vnd.ms-excel'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'ppt' then 'application/vnd.ms-powerpoint'
    when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  end;
$$;

revoke execute on function task_file_mime_for_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- task_submission_check (internal): who may submit right now, and whether the
-- submission would be late. Raises a coded exception otherwise. Not granted to
-- clients; the public entry points below call it.
-- ---------------------------------------------------------------------------
create function task_submission_check(p_assessment uuid, p_enrollment uuid)
returns table (
  organization_id uuid,
  course_id uuid,
  max_files int,
  is_late boolean,
  attempt_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_assessment assessments%rowtype;
  v_attempt assessment_attempts%rowtype;
  v_module uuid;
  v_state text;
  v_late boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_enrollment from course_enrollments where id = p_enrollment;

  if v_enrollment.id is null
     or v_enrollment.user_id <> auth.uid()
     or coalesce((select is_org_member(v_enrollment.organization_id)), false) is not true then
    raise exception 'NOT_ENROLLED' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status = 'CANCELLED' then
    raise exception 'ENROLLMENT_CANCELLED' using errcode = 'insufficient_privilege';
  end if;

  select * into v_assessment from assessments where id = p_assessment;

  if v_assessment.id is null
     or v_assessment.course_id <> v_enrollment.course_id
     or v_assessment.kind <> 'TASK' then
    raise exception 'Assessment not found' using errcode = 'no_data_found';
  end if;

  if v_assessment.status <> 'PUBLISHED' then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = 'invalid_parameter_value';
  end if;

  if v_assessment.available_from is not null and now() < v_assessment.available_from then
    raise exception 'WINDOW_NOT_OPEN' using errcode = 'invalid_parameter_value';
  end if;

  v_module := (select assessment_module_id(p_assessment));
  if v_module is not null then
    select u.state into v_state
    from module_unlock_state(p_enrollment) u
    where u.module_id = v_module;

    if v_state is distinct from 'AVAILABLE' and v_state is distinct from 'COMPLETED' then
      raise exception 'MODULE_LOCKED' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select * into v_attempt
  from assessment_attempts a
  where a.enrollment_id = p_enrollment and a.assessment_id = p_assessment
  order by a.attempt_number desc
  limit 1;

  -- A graded submission is final, whatever the dates say: a deadline moved
  -- later after grading must not reopen it (the grade would go stale).
  if v_attempt.status = 'GRADED' then
    raise exception 'ALREADY_GRADED' using errcode = 'invalid_parameter_value';
  end if;

  -- Fails closed: a missing deadline counts as passed.
  v_late := coalesce(now() >= v_assessment.available_until, true);

  if v_late and not (
    v_assessment.allow_late_submissions
    and (
      v_attempt.id is null
      or (v_attempt.submitted_late and v_attempt.status <> 'GRADED')
    )
  ) then
    raise exception 'WINDOW_CLOSED' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select v_assessment.organization_id, v_assessment.course_id, v_assessment.max_files, v_late, v_attempt.id;
end;
$$;

revoke execute on function task_submission_check(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- task_submission_slot: the gate the upload action calls before minting
-- signed upload URLs. Runs as the student.
-- ---------------------------------------------------------------------------
create function task_submission_slot(p_assessment uuid, p_enrollment uuid)
returns table (organization_id uuid, course_id uuid, max_files int, is_late boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.organization_id, c.course_id, c.max_files, c.is_late
  from task_submission_check(p_assessment, p_enrollment) c;
$$;

revoke execute on function task_submission_slot(uuid, uuid) from public, anon;
grant execute on function task_submission_slot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_task: records (or replaces) the student's submission.
--
-- `p_paths` holds object paths already uploaded via signed URLs. Size and MIME
-- are read from `storage.objects` (written by the storage server, which also
-- enforced the bucket limits), never from the client. Returns the paths of
-- replaced files so the caller can delete the objects.
-- ---------------------------------------------------------------------------
create function submit_task(p_assessment uuid, p_enrollment uuid, p_files jsonb)
returns table (attempt_id uuid, removed_paths text[])
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_check record;
  v_prefix text;
  v_count int;
  v_found int;
  v_attempt_id uuid;
  v_removed text[];
  v_block record;
  v_course uuid;
begin
  -- Ownership before any lock, so a caller cannot hold someone else's row (N1).
  if not exists (select 1 from course_enrollments where id = p_enrollment and user_id = auth.uid()) then
    raise exception 'NOT_ENROLLED' using errcode = 'insufficient_privilege';
  end if;

  -- Lock order matches every attempt writer: enrollment first.
  perform 1 from course_enrollments where id = p_enrollment for update;

  select * into v_check from task_submission_check(p_assessment, p_enrollment);

  if jsonb_typeof(coalesce(p_files, 'null'::jsonb)) <> 'array' then
    raise exception 'INVALID_FILES' using errcode = 'invalid_parameter_value';
  end if;

  v_count := jsonb_array_length(p_files);
  if v_count < 1 then
    raise exception 'NO_FILES' using errcode = 'invalid_parameter_value';
  end if;
  if v_count > v_check.max_files then
    raise exception 'TOO_MANY_FILES' using errcode = 'invalid_parameter_value';
  end if;

  v_prefix := v_check.organization_id || '/' || v_check.course_id || '/' || p_assessment || '/' || p_enrollment || '/';

  -- Every path must be distinct, inside this enrollment's prefix and exist in
  -- the bucket with a real size. The display filename is client-supplied, so
  -- its extension must match the stored object's MIME (no "notas.pdf.exe"
  -- served as a PDF, no `x.html` for a PDF object), and invisible/bidi
  -- control characters are stripped before it is stored (see insert below).
  select count(distinct o.name) into v_found
  from jsonb_to_recordset(p_files) as x(path text, filename text)
  join storage.objects o on o.bucket_id = 'task-submissions' and o.name = x.path
  where left(x.path, length(v_prefix)) = v_prefix
    and position('..' in x.path) = 0
    and coalesce((o.metadata ->> 'size')::bigint, 0) > 0
    and char_length(coalesce(trim(x.filename), '')) between 1 and 255
    and o.metadata ->> 'mimetype' = task_file_mime_for_name(x.path)
    and o.metadata ->> 'mimetype' = task_file_mime_for_name(x.filename);

  if v_found <> v_count then
    raise exception 'INVALID_FILES' using errcode = 'invalid_parameter_value';
  end if;

  if v_check.attempt_id is null then
    insert into assessment_attempts (
      assessment_id, enrollment_id, user_id, organization_id, attempt_number,
      status, started_at, submitted_at, availability_until, max_score, submitted_late
    )
    select p_assessment, p_enrollment, auth.uid(), v_check.organization_id, 1,
           'SUBMITTED', now(), now(), a.available_until, 100, v_check.is_late
    from assessments a where a.id = p_assessment
    returning id into v_attempt_id;
  else
    v_attempt_id := v_check.attempt_id;
    update assessment_attempts
    set status = 'SUBMITTED',
        submitted_at = now(),
        submitted_late = v_check.is_late,
        updated_at = now()
    where id = v_attempt_id;
  end if;

  select coalesce(array_agg(f.storage_path), '{}') into v_removed
  from assessment_submission_files f
  where f.attempt_id = v_attempt_id
    and f.storage_path not in (select x.path from jsonb_to_recordset(p_files) as x(path text));

  delete from assessment_submission_files where assessment_submission_files.attempt_id = v_attempt_id;

  insert into assessment_submission_files (
    organization_id, attempt_id, storage_path, filename, mime_type, size_bytes, position
  )
  select v_check.organization_id, v_attempt_id, x.path,
         trim(regexp_replace(x.filename, '[[:cntrl:]\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', 'g')),
         o.metadata ->> 'mimetype',
         (o.metadata ->> 'size')::bigint,
         x.ord::int
  from rows from (jsonb_to_recordset(p_files) as (path text, filename text)) with ordinality as x(path, filename, ord)
  join storage.objects o on o.bucket_id = 'task-submissions' and o.name = x.path;

  -- Submitting completes the TASK block(s) pointing at this assessment, scoped
  -- to the enrolled course (same rule `finalize_attempt` used for TASK).
  select e.course_id into v_course from course_enrollments e where e.id = p_enrollment;

  for v_block in
    select b.id as block_id
    from lesson_content_blocks b
    join lessons l on l.id = b.lesson_id
    join modules m on m.id = l.module_id
    where b.assessment_id = p_assessment
      and m.course_id = v_course
  loop
    insert into content_progress (enrollment_id, content_block_id)
    values (p_enrollment, v_block.block_id)
    on conflict (enrollment_id, content_block_id) do nothing;
  end loop;

  perform recalc_enrollment_progress(p_enrollment);

  perform log_audit_system(
    v_check.organization_id,
    case when v_check.attempt_id is null then 'assessment.task_submitted' else 'assessment.task_resubmitted' end,
    'assessment_attempt',
    v_attempt_id,
    jsonb_build_object('assessment_id', p_assessment, 'files', v_count, 'late', v_check.is_late)
  );

  return query select v_attempt_id, v_removed;
end;
$$;

revoke execute on function submit_task(uuid, uuid, jsonb) from public, anon;
grant execute on function submit_task(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- grade_task_submission: one 0..100 score plus optional feedback. Only after
-- the deadline, so a graded submission can never be replaced afterwards
-- (on-time ones are frozen; late ones lock once GRADED).
-- ---------------------------------------------------------------------------
create function grade_task_submission(
  p_attempt uuid,
  p_score int,
  p_feedback text default null,
  -- The `submitted_at` the grader was looking at. A late submission can still
  -- be replaced until graded; if it changed meanwhile the grade is refused.
  p_submitted_at timestamptz default null
)
returns table (status attempt_status, score_percent numeric, score_label text, passed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt assessment_attempts%rowtype;
  v_assessment assessments%rowtype;
  v_label text;
  v_passing boolean;
begin
  -- Authorisation first, before locks or any row is revealed (N1).
  if coalesce((select can_grade_attempt(p_attempt)), false) is not true then
    raise exception 'Not allowed to grade this attempt' using errcode = 'insufficient_privilege';
  end if;

  perform 1
  from course_enrollments
  where id = (select t.enrollment_id from assessment_attempts t where t.id = p_attempt)
  for update;

  select * into v_attempt from assessment_attempts t where t.id = p_attempt for update;
  select * into v_assessment from assessments a where a.id = v_attempt.assessment_id;

  if v_assessment.kind <> 'TASK' then
    raise exception 'INVALID_BLOCK_TYPE' using errcode = 'invalid_parameter_value';
  end if;

  if v_attempt.status not in ('SUBMITTED', 'GRADED') then
    raise exception 'ATTEMPT_IN_PROGRESS' using errcode = 'invalid_parameter_value';
  end if;

  if now() < v_assessment.available_until then
    raise exception 'DEADLINE_NOT_PASSED' using errcode = 'invalid_parameter_value';
  end if;

  if p_submitted_at is not null and v_attempt.submitted_at is distinct from p_submitted_at then
    raise exception 'STALE_SUBMISSION' using errcode = 'invalid_parameter_value';
  end if;

  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'INVALID_ANSWER' using errcode = 'invalid_parameter_value';
  end if;

  select r.label, r.is_passing into v_label, v_passing
  from resolve_score_label(v_attempt.organization_id, p_score) r;

  update assessment_attempts t
  set auto_score = 0,
      manual_score = p_score,
      total_score = p_score,
      max_score = 100,
      score_percent = p_score,
      score_label = v_label,
      passed = v_passing,
      status = 'GRADED',
      graded_at = now(),
      updated_at = now()
  where t.id = p_attempt;

  -- Re-grading with an empty box clears earlier feedback.
  if p_feedback is not null and length(trim(p_feedback)) > 0 then
    insert into assessment_feedback (attempt_id, professor_id, feedback)
    values (p_attempt, auth.uid(), trim(p_feedback))
    on conflict (attempt_id) do update
    set feedback = excluded.feedback,
        professor_id = excluded.professor_id;
  else
    delete from assessment_feedback f where f.attempt_id = p_attempt;
  end if;

  perform recalc_enrollment_progress(v_attempt.enrollment_id);

  perform log_audit(
    v_attempt.organization_id,
    'assessment.task_graded',
    'assessment_attempt',
    p_attempt,
    jsonb_build_object('score', p_score)
  );

  return query
  select t.status, t.score_percent, t.score_label, t.passed
  from assessment_attempts t
  where t.id = p_attempt;
end;
$$;

revoke execute on function grade_task_submission(uuid, int, text, timestamptz) from public, anon;
grant execute on function grade_task_submission(uuid, int, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- my_task_submission: the student's own view. Score, label, passed and
-- feedback stay hidden until GRADED, like `attempt_result`.
-- ---------------------------------------------------------------------------
create function my_task_submission(p_assessment uuid, p_enrollment uuid)
returns table (
  attempt_id uuid,
  status attempt_status,
  submitted_at timestamptz,
  submitted_late boolean,
  score_percent numeric,
  score_label text,
  passed boolean,
  feedback text,
  files jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.status,
    t.submitted_at,
    t.submitted_late,
    case when t.status = 'GRADED' then t.score_percent end,
    case when t.status = 'GRADED' then t.score_label end,
    case when t.status = 'GRADED' then t.passed end,
    case when t.status = 'GRADED' then fb.feedback end,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', f.id, 'filename', f.filename, 'mimeType', f.mime_type, 'sizeBytes', f.size_bytes)
          order by f.position
        )
        from assessment_submission_files f
        where f.attempt_id = t.id
      ),
      '[]'::jsonb
    )
  from assessment_attempts t
  join course_enrollments e on e.id = t.enrollment_id
  left join assessment_feedback fb on fb.attempt_id = t.id
  where t.assessment_id = p_assessment
    and t.enrollment_id = p_enrollment
    and e.user_id = auth.uid()
    and t.user_id = auth.uid()
    and coalesce((select is_org_member(t.organization_id)), false)
  order by t.attempt_number desc
  limit 1;
$$;

revoke execute on function my_task_submission(uuid, uuid) from public, anon;
grant execute on function my_task_submission(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- task_file_for_download: the storage path of one submitted file, for its
-- owner or a grader only. The server action signs it with the service role.
-- ---------------------------------------------------------------------------
create function task_file_for_download(p_file uuid)
returns table (storage_path text, filename text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt uuid;
begin
  select f.attempt_id into v_attempt from assessment_submission_files f where f.id = p_file;

  if v_attempt is null or coalesce((select can_view_attempt(v_attempt)), false) is not true then
    raise exception 'Not allowed to read this file' using errcode = 'insufficient_privilege';
  end if;

  return query
  select f.storage_path, f.filename from assessment_submission_files f where f.id = p_file;
end;
$$;

revoke execute on function task_file_for_download(uuid) from public, anon;
grant execute on function task_file_for_download(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- professor_overview_stats: "pendientes de corrección" must match the grading
-- queue, which hides TASK submissions until the deadline has passed.
-- ---------------------------------------------------------------------------
create or replace function professor_overview_stats()
returns table (
  course_id uuid,
  course_title text,
  enrolled_count bigint,
  avg_progress_percent numeric,
  attempts_in_progress bigint,
  attempts_submitted bigint,
  attempts_auto_submitted bigint,
  attempts_graded bigint,
  pending_grading_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  return query
  with my_courses as (
    select cp.course_id
    from course_professors cp
    join courses c on c.id = cp.course_id
    where cp.user_id = auth.uid()
      and exists (
        select 1
        from organization_memberships om
        where om.organization_id = c.organization_id
          and om.user_id = auth.uid()
          and om.status = 'ACTIVE'
          and om.role = 'PROFESSOR'
      )
  ),
  enrollment_stats as (
    select ce.course_id, count(*) as n, avg(ce.progress_percent) as avg_progress
    from course_enrollments ce
    where ce.course_id in (select mc.course_id from my_courses mc)
      and ce.status <> 'CANCELLED'
    group by ce.course_id
  ),
  attempt_stats as (
    select
      a.course_id,
      count(*) filter (where aa.status = 'IN_PROGRESS') as in_progress,
      count(*) filter (where aa.status = 'SUBMITTED') as submitted,
      count(*) filter (where aa.status = 'AUTO_SUBMITTED') as auto_submitted,
      count(*) filter (where aa.status = 'GRADED') as graded,
      count(*) filter (
        where aa.status in ('SUBMITTED', 'AUTO_SUBMITTED')
          -- A TASK is only gradable after its deadline; match the grading queue.
          and (a.kind <> 'TASK' or now() >= a.available_until)
      ) as pending
    from assessments a
    join assessment_attempts aa on aa.assessment_id = a.id
    where a.course_id in (select mc.course_id from my_courses mc)
    group by a.course_id
  )
  select
    c.id,
    c.title,
    coalesce(es.n, 0),
    round(coalesce(es.avg_progress, 0), 1),
    coalesce(ast.in_progress, 0),
    coalesce(ast.submitted, 0),
    coalesce(ast.auto_submitted, 0),
    coalesce(ast.graded, 0),
    coalesce(ast.pending, 0)
  from my_courses mc
  join courses c on c.id = mc.course_id
  left join enrollment_stats es on es.course_id = c.id
  left join attempt_stats ast on ast.course_id = c.id
  order by c.title;
end;
$$;

revoke execute on function professor_overview_stats() from public, anon;
grant execute on function professor_overview_stats() to authenticated;
