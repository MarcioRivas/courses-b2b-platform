-- Phase 5A — Question banks, questions and assessment configuration.
-- Shapes come from docs/database-schema.md §4. Attempt tables ship in the next
-- migration; the RPCs in the one after that.

-- ---------------------------------------------------------------------------
-- Question banks
-- ---------------------------------------------------------------------------
create table question_banks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  -- A bank may be scoped to one course or shared across the org (NULL).
  course_id uuid references courses (id) on delete set null,
  name text not null,
  description text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_banks_organization_id_idx on question_banks (organization_id);
create index question_banks_course_id_idx on question_banks (course_id);

create trigger set_updated_at
  before update on question_banks
  for each row execute function set_updated_at();

alter table question_banks enable row level security;
alter table question_banks force row level security;

-- ---------------------------------------------------------------------------
-- Questions. Never hard-deleted once used by an assessment (the FK from
-- assessment_questions is RESTRICT) — `is_active` retires them instead.
-- ---------------------------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  question_bank_id uuid not null references question_banks (id) on delete cascade,
  -- Denormalised from the bank so policies filter without a join.
  organization_id uuid not null references organizations (id) on delete cascade,
  type question_type not null,
  prompt text not null,
  default_points numeric(6, 2) not null default 1 check (default_points > 0),
  is_active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_bank_active_idx on questions (question_bank_id, is_active);
create index questions_organization_id_idx on questions (organization_id);

create trigger set_updated_at
  before update on questions
  for each row execute function set_updated_at();

alter table questions enable row level security;
alter table questions force row level security;

-- ---------------------------------------------------------------------------
-- Options. `is_correct` lives here and students have NO policy on this table
-- at all (C8) — the answer key never travels to a client.
-- ---------------------------------------------------------------------------
create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  label text not null,
  position int not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  constraint question_options_question_position_key unique (question_id, position) deferrable initially deferred
);

create index question_options_question_id_idx on question_options (question_id);

alter table question_options enable row level security;
alter table question_options force row level security;

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create table assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  -- Set for an EXAM attached to a module; NULL for QUIZ/TASK reached through a
  -- lesson content block.
  module_id uuid references modules (id) on delete set null,
  kind assessment_kind not null,
  status assessment_status not null default 'DRAFT',
  title text not null,
  description text,
  question_bank_id uuid references question_banks (id) on delete set null,
  random_question_count int check (random_question_count > 0),
  duration_seconds int check (duration_seconds > 0),
  available_from timestamptz,
  available_until timestamptz,
  passing_score int check (passing_score between 0 and 100),
  -- NULL means unlimited attempts (B3).
  max_attempts int check (max_attempts > 0),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An EXAM is the only kind that must be time-boxed (B3).
  constraint assessments_exam_window_check check (
    kind <> 'EXAM'
    or (duration_seconds is not null and available_from is not null and available_until is not null)
  ),
  constraint assessments_window_order_check check (
    available_from is null or available_until is null or available_from < available_until
  ),
  constraint assessments_random_needs_bank_check check (
    random_question_count is null or question_bank_id is not null
  )
);

create index assessments_course_kind_idx on assessments (course_id, kind);
create index assessments_module_id_idx on assessments (module_id);

create trigger set_updated_at
  before update on assessments
  for each row execute function set_updated_at();

alter table assessments enable row level security;
alter table assessments force row level security;

-- ---------------------------------------------------------------------------
-- Fixed question list. RESTRICT: a question used by an assessment cannot be
-- deleted out from under it (deactivate instead).
-- ---------------------------------------------------------------------------
create table assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  question_id uuid not null references questions (id) on delete restrict,
  position int not null,
  points numeric(6, 2) not null default 1 check (points > 0),
  created_at timestamptz not null default now(),
  unique (assessment_id, question_id),
  constraint assessment_questions_position_key unique (assessment_id, position) deferrable initially deferred
);

create index assessment_questions_assessment_id_idx on assessment_questions (assessment_id);

alter table assessment_questions enable row level security;
alter table assessment_questions force row level security;

-- ---------------------------------------------------------------------------
-- The two foreign keys Phase 3 could not create: `assessments` did not exist
-- yet, so the columns shipped bare with a TODO(P5) (D6).
--
-- The block FK is NO ACTION DEFERRABLE, not RESTRICT, and the difference
-- matters. The goal is "an author must not delete an assessment a lesson still
-- displays". RESTRICT achieved that but also made the whole COURSE
-- undeletable: blocks and assessments are both children of a course, and when
-- the course cascade happened to remove the assessment first, RESTRICT fired
-- immediately and aborted the delete — a course containing one quiz could
-- never be removed.
--
-- Deferring the check to commit fixes exactly that asymmetry. Deleting a course
-- removes the blocks and the assessments in the same transaction, so by commit
-- nothing dangles and the delete succeeds. Deleting an assessment on its own
-- while a block still points at it still fails at commit — which is the rule we
-- actually wanted, and which `delete_assessment` also reports up front as
-- CONFLICT_HAS_BLOCKS.
-- ---------------------------------------------------------------------------
alter table module_dependencies
  add constraint module_dependencies_assessment_id_fkey
  foreign key (assessment_id) references assessments (id) on delete cascade;

alter table lesson_content_blocks
  add constraint lesson_content_blocks_assessment_id_fkey
  foreign key (assessment_id) references assessments (id)
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- can_edit_question_bank: the single authority over bank/question/option
-- authoring. Written once here rather than inlined into eight policies —
-- Phase 4's review flagged exactly this kind of duplicated predicate.
--
-- A bank scoped to a course follows that course's editors; an org-wide bank
-- (course_id NULL) is open to the org's admins and professors. `is_org_member`
-- is required in every branch so a deactivated membership or organization
-- loses access immediately (D29).
-- ---------------------------------------------------------------------------
create function can_edit_question_bank(p_bank uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        (select is_org_member(b.organization_id))
        and (
          (select is_org_admin(b.organization_id))
          or (b.course_id is not null and (select is_course_professor(b.course_id)))
          or (b.course_id is null and (select user_org_role(b.organization_id)) = 'PROFESSOR')
        )
      from question_banks b
      where b.id = p_bank
    ),
    false
  );
$$;

revoke execute on function can_edit_question_bank(uuid) from public, anon;
grant execute on function can_edit_question_bank(uuid) to authenticated;

/** The owning bank of a question — keeps the option policies to one join. */
create function question_bank_id_of_question(p_question uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select question_bank_id from questions where id = p_question;
$$;

revoke execute on function question_bank_id_of_question(uuid) from public, anon;
grant execute on function question_bank_id_of_question(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies.
--
-- Authoring surface only: students get NO policy whatsoever on
-- `question_banks`, `questions`, `question_options` or `assessment_questions`.
-- A student never reads a question row directly — they read the immutable
-- snapshot taken into `assessment_attempt_questions` at start (§22, C8).
-- ---------------------------------------------------------------------------
create policy question_banks_all on question_banks
  for all to authenticated
  using ((select can_edit_question_bank(id)))
  with check (
    -- A row being INSERTed is not visible to the function yet, so the create
    -- case is authorised against the org/course columns directly.
    (select is_org_member(organization_id))
    and (
      (select is_org_admin(organization_id))
      or (course_id is not null and (select is_course_professor(course_id)))
      or (course_id is null and (select user_org_role(organization_id)) = 'PROFESSOR')
    )
  );

create policy questions_all on questions
  for all to authenticated
  using ((select can_edit_question_bank(question_bank_id)))
  with check ((select can_edit_question_bank(question_bank_id)));

create policy question_options_all on question_options
  for all to authenticated
  using ((select can_edit_question_bank((select question_bank_id_of_question(question_id)))))
  with check ((select can_edit_question_bank((select question_bank_id_of_question(question_id)))));

-- Assessments: staff manage them; a student may see that a PUBLISHED one
-- exists in a course they can view (title/window/kind drive the "Evaluaciones"
-- section, F13). Nothing here exposes questions or keys.
create policy assessments_select on assessments
  for select to authenticated
  using (
    (select can_edit_course(course_id))
    or (status = 'PUBLISHED' and (select student_can_view_course(course_id)))
  );

create policy assessments_write on assessments
  for all to authenticated
  using ((select can_edit_course(course_id)))
  with check ((select can_edit_course(course_id)));

-- The fixed question list is staff-only: it names question ids, which is a
-- step toward the bank a student must never read.
create policy assessment_questions_all on assessment_questions
  for all to authenticated
  using (
    exists (
      select 1 from assessments a
      where a.id = assessment_questions.assessment_id
        and (select can_edit_course(a.course_id))
    )
  )
  with check (
    exists (
      select 1 from assessments a
      where a.id = assessment_questions.assessment_id
        and (select can_edit_course(a.course_id))
    )
  );
