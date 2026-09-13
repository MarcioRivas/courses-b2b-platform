-- Phase 5C (part 1) — Attempt, snapshot, answer-key, grade and feedback tables.
--
-- Two invariants this file exists to establish, before a single RPC is written:
--
--   1. NOTHING here is writable by `authenticated` (D24). There is not one
--      INSERT/UPDATE/DELETE policy in this file. Every write goes through a
--      SECURITY DEFINER RPC that owns the rules about time, ownership and
--      state. A policy cannot express "only while the clock says so".
--   2. The answer key lives in its own table with NO policies and NO grants
--      (C8). It is unreachable from any client session regardless of what a
--      future `select *` does, because the grant simply is not there.

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
create table assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: an assessment with history cannot be deleted (C10).
  assessment_id uuid not null references assessments (id) on delete restrict,
  enrollment_id uuid not null references course_enrollments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  attempt_number int not null check (attempt_number > 0),
  status attempt_status not null default 'IN_PROGRESS',
  started_at timestamptz not null default now(),
  -- Snapshotted from the assessment so a later config edit cannot move the
  -- deadline of an attempt already running (§25).
  duration_seconds int check (duration_seconds > 0),
  availability_until timestamptz,
  -- A PLAIN column, written by start_attempt (D31): LEAST(..., make_interval())
  -- is not immutable, so a STORED generated column does not compile.
  effective_end_at timestamptz,
  active_session_id uuid,
  session_last_seen_at timestamptz,
  submitted_at timestamptz,
  graded_at timestamptz,
  auto_score numeric(8, 2) not null default 0,
  manual_score numeric(8, 2) not null default 0,
  total_score numeric(8, 2) not null default 0,
  max_score numeric(8, 2) not null default 0,
  score_percent numeric(5, 2),
  score_label text,
  passed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, assessment_id, attempt_number)
);

-- One live attempt per (enrollment, assessment), enforced by the database
-- rather than by application logic: two parallel start_attempt calls race into
-- this index and the loser catches unique_violation and returns the winner's
-- attempt. Race-safe by construction.
create unique index assessment_attempts_one_in_progress_idx
  on assessment_attempts (enrollment_id, assessment_id)
  where status = 'IN_PROGRESS';

-- The cron sweep's only query: the partial index keeps it off a seq scan even
-- when the table holds every attempt ever made.
create index assessment_attempts_sweep_idx
  on assessment_attempts (effective_end_at)
  where status = 'IN_PROGRESS';

create index assessment_attempts_assessment_status_idx
  on assessment_attempts (assessment_id, status);
create index assessment_attempts_user_id_idx on assessment_attempts (user_id);
create index assessment_attempts_enrollment_id_idx on assessment_attempts (enrollment_id);

create trigger set_updated_at
  before update on assessment_attempts
  for each row execute function set_updated_at();

alter table assessment_attempts enable row level security;
alter table assessment_attempts force row level security;

-- ---------------------------------------------------------------------------
-- The snapshot. Questions are copied here at start with their text and
-- options, so editing the bank mid-exam cannot change an in-flight attempt
-- (§22). The student's answers live in the same row (D34) — there is no
-- separate answers table.
--
-- `options` is `[{id, label}]` and deliberately carries NO `is_correct`.
-- ---------------------------------------------------------------------------
create table assessment_attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references assessment_attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete restrict,
  position int not null,
  type question_type not null,
  prompt text not null,
  options jsonb not null default '[]',
  points numeric(6, 2) not null,
  selected_option_id uuid,
  text_answer text,
  -- Client-monotonic per question: a retry carrying an older seq must never
  -- overwrite a newer answer (D4/D30).
  client_seq int not null default 0,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index assessment_attempt_questions_attempt_position_idx
  on assessment_attempt_questions (attempt_id, position);

alter table assessment_attempt_questions enable row level security;
alter table assessment_attempt_questions force row level security;

-- ---------------------------------------------------------------------------
-- Answer keys. Separate table, no RLS policy, no grants to anyone (C8).
-- Only SECURITY DEFINER functions owned by `postgres` ever read it.
-- ---------------------------------------------------------------------------
create table assessment_attempt_answer_keys (
  attempt_id uuid not null references assessment_attempts (id) on delete cascade,
  attempt_question_id uuid not null references assessment_attempt_questions (id) on delete cascade,
  correct_option_ids uuid[] not null default '{}',
  primary key (attempt_id, attempt_question_id)
);

alter table assessment_attempt_answer_keys enable row level security;
alter table assessment_attempt_answer_keys force row level security;

-- Belt and braces: RLS with zero policies already denies everything, and the
-- grants are withdrawn so even a future policy mistake cannot expose it.
revoke all on table assessment_attempt_answer_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grades (per question) and overall feedback.
-- ---------------------------------------------------------------------------
create table assessment_grades (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references assessment_attempts (id) on delete cascade,
  attempt_question_id uuid not null references assessment_attempt_questions (id) on delete cascade,
  points_awarded numeric(6, 2) not null default 0,
  is_correct boolean,
  feedback text,
  -- NULL means the row was written by auto-grading, not by a person.
  graded_by uuid references profiles (id) on delete set null,
  graded_at timestamptz not null default now(),
  unique (attempt_id, attempt_question_id)
);

create index assessment_grades_attempt_id_idx on assessment_grades (attempt_id);

alter table assessment_grades enable row level security;
alter table assessment_grades force row level security;

create table assessment_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references assessment_attempts (id) on delete cascade unique,
  professor_id uuid references profiles (id) on delete set null,
  feedback text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on assessment_feedback
  for each row execute function set_updated_at();

alter table assessment_feedback enable row level security;
alter table assessment_feedback force row level security;

-- ---------------------------------------------------------------------------
-- Policies — SELECT only, and never for the student on scoring tables.
--
-- A student gets no SELECT on `assessment_attempts`, `assessment_grades` or
-- `assessment_feedback` (D24/F7). The reason is narrow and important: a
-- SUBMITTED-but-ungraded attempt would otherwise be a correctness oracle —
-- reading your own score before the professor has finished tells you which
-- answers were right. Results reach students only through
-- `student_attempt_view` / `list_my_attempts`, which withhold scores and
-- correctness until `status = 'GRADED'`.
--
-- The one student-readable table is their own snapshot row, which holds their
-- own answers and no key data.
-- ---------------------------------------------------------------------------
create policy assessment_attempts_select on assessment_attempts
  for select to authenticated
  using (
    (select is_org_admin(organization_id))
    or exists (
      select 1 from assessments a
      where a.id = assessment_attempts.assessment_id
        and (select is_course_professor(a.course_id))
    )
  );

create policy assessment_attempt_questions_select on assessment_attempt_questions
  for select to authenticated
  using (
    exists (
      select 1
      from assessment_attempts t
      where t.id = assessment_attempt_questions.attempt_id
        and (
          (t.user_id = (select auth.uid()) and (select is_org_member(t.organization_id)))
          or (select is_org_admin(t.organization_id))
          or exists (
            select 1 from assessments a
            where a.id = t.assessment_id
              and (select is_course_professor(a.course_id))
          )
        )
    )
  );

create policy assessment_grades_select on assessment_grades
  for select to authenticated
  using (
    exists (
      select 1
      from assessment_attempts t
      where t.id = assessment_grades.attempt_id
        and (
          (select is_org_admin(t.organization_id))
          or exists (
            select 1 from assessments a
            where a.id = t.assessment_id
              and (select is_course_professor(a.course_id))
          )
        )
    )
  );

create policy assessment_feedback_select on assessment_feedback
  for select to authenticated
  using (
    exists (
      select 1
      from assessment_attempts t
      where t.id = assessment_feedback.attempt_id
        and (
          (select is_org_admin(t.organization_id))
          or exists (
            select 1 from assessments a
            where a.id = t.assessment_id
              and (select is_course_professor(a.course_id))
          )
        )
    )
  );
