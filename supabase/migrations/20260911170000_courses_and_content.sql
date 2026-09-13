-- Phase 3 — Courses, content, offerings, enrollment & progress tables
-- Shapes come from docs/database-schema.md §2 and §3. No policies here; they
-- ship in the helpers/policies migration so the helper functions exist first.

-- ---------------------------------------------------------------------------
-- Courses & professor assignment
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  title text not null,
  description text,
  cover_image_path text,
  status course_status not null default 'DRAFT',
  access_type course_access not null default 'PRIVATE',
  created_by uuid references profiles (id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_organization_id_status_idx on courses (organization_id, status);
create index courses_org_access_published_idx
  on courses (organization_id, access_type)
  where status = 'PUBLISHED';

create trigger set_updated_at
  before update on courses
  for each row execute function set_updated_at();

alter table courses enable row level security;
alter table courses force row level security;

create table course_professors (
  course_id uuid not null references courses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  assigned_by uuid references profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create index course_professors_user_id_idx on course_professors (user_id);

alter table course_professors enable row level security;
alter table course_professors force row level security;

-- The Phase 1 trigger function already handles this table (it branches on
-- tg_table_name and requires an ACTIVE PROFESSOR membership in the course org).
create trigger assert_active_member_of_org
  before insert on course_professors
  for each row execute function assert_active_member_of_org();

-- ---------------------------------------------------------------------------
-- Modules, lessons, content blocks
-- Position uniqueness is DEFERRABLE: reordering rewrites every position in one
-- statement, which transiently collides until the transaction commits.
-- ---------------------------------------------------------------------------
create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  title text not null,
  description text,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_course_position_key unique (course_id, position) deferrable initially deferred
);

create index modules_course_id_idx on modules (course_id);

create trigger set_updated_at
  before update on modules
  for each row execute function set_updated_at();

alter table modules enable row level security;
alter table modules force row level security;

create table module_dependencies (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  condition dependency_condition not null,
  depends_on_module_id uuid references modules (id) on delete cascade,
  -- TODO(P5): add FK to assessments once that table exists (D6).
  assessment_id uuid,
  min_score int check (min_score between 0 and 100),
  created_at timestamptz not null default now(),
  constraint module_dependencies_shape_check check (
    (condition = 'MODULE_COMPLETED' and depends_on_module_id is not null and assessment_id is null)
    or (condition = 'QUIZ_PASSED' and assessment_id is not null)
  ),
  constraint module_dependencies_no_self_check check (depends_on_module_id is distinct from module_id)
);

create index module_dependencies_module_id_idx on module_dependencies (module_id);

alter table module_dependencies enable row level security;
alter table module_dependencies force row level security;

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules (id) on delete cascade,
  title text not null,
  description text,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_module_position_key unique (module_id, position) deferrable initially deferred
);

create index lessons_module_id_idx on lessons (module_id);

create trigger set_updated_at
  before update on lessons
  for each row execute function set_updated_at();

alter table lessons enable row level security;
alter table lessons force row level security;

create table lesson_content_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  type content_block_type not null,
  position int not null,
  data jsonb not null default '{}',
  -- TODO(P5): add FK to assessments once that table exists (D6).
  assessment_id uuid,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_content_blocks_lesson_position_key unique (lesson_id, position) deferrable initially deferred,
  -- QUIZ/TASK blocks exist only to point at an assessment, and no other type
  -- may carry one. Phase 3 cannot create them: assessments arrive in Phase 5.
  constraint lesson_content_blocks_assessment_shape_check
    check ((type in ('QUIZ', 'TASK')) = (assessment_id is not null))
);

create index lesson_content_blocks_lesson_id_idx on lesson_content_blocks (lesson_id);

create trigger set_updated_at
  before update on lesson_content_blocks
  for each row execute function set_updated_at();

alter table lesson_content_blocks enable row level security;
alter table lesson_content_blocks force row level security;

-- ---------------------------------------------------------------------------
-- Offerings: one execution of a course. Content never carries dates (B1) —
-- offering_module_schedules does.
-- ---------------------------------------------------------------------------
create table course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  -- Denormalised from the course so RLS can filter without a join.
  organization_id uuid not null references organizations (id) on delete cascade,
  kind offering_kind not null,
  group_id uuid references groups (id) on delete restrict,
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_offerings_group_shape_check check (
    (kind = 'GROUP' and group_id is not null)
    or (kind = 'OPEN' and group_id is null)
  )
);

-- A FREE course has exactly one OPEN offering (D13).
create unique index course_offerings_one_open_per_course_idx
  on course_offerings (course_id)
  where kind = 'OPEN';

create index course_offerings_course_id_status_idx on course_offerings (course_id, status);
create index course_offerings_group_id_idx on course_offerings (group_id);

create trigger set_updated_at
  before update on course_offerings
  for each row execute function set_updated_at();

alter table course_offerings enable row level security;
alter table course_offerings force row level security;

create table offering_module_schedules (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz not null default now(),
  unique (offering_id, module_id),
  -- NULL on either side means "unbounded on that side"; both NULL means the
  -- module is always available for this offering.
  constraint offering_module_schedules_window_check
    check (available_from is null or available_until is null or available_from < available_until)
);

create index offering_module_schedules_offering_id_idx on offering_module_schedules (offering_id);

alter table offering_module_schedules enable row level security;
alter table offering_module_schedules force row level security;

-- ---------------------------------------------------------------------------
-- Enrollment & progress. Neither table gets an `authenticated` write policy —
-- every write goes through a SECURITY DEFINER RPC (D24).
-- ---------------------------------------------------------------------------
create table course_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  offering_id uuid not null references course_offerings (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status enrollment_status not null default 'ACTIVE',
  source enrollment_source not null,
  enrolled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  progress_percent numeric(5, 2) not null default 0,
  completed_blocks int not null default 0,
  total_blocks int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, user_id)
);

create index course_enrollments_user_id_status_idx on course_enrollments (user_id, status);
create index course_enrollments_course_id_idx on course_enrollments (course_id);
create index course_enrollments_organization_id_idx on course_enrollments (organization_id);

create trigger set_updated_at
  before update on course_enrollments
  for each row execute function set_updated_at();

alter table course_enrollments enable row level security;
alter table course_enrollments force row level security;

create table content_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references course_enrollments (id) on delete cascade,
  content_block_id uuid not null references lesson_content_blocks (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (enrollment_id, content_block_id)
);

create index content_progress_enrollment_id_idx on content_progress (enrollment_id);

alter table content_progress enable row level security;
alter table content_progress force row level security;
