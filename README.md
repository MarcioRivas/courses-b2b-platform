# ENECourses

Multi-tenant LMS for sports organizations (clubs, federations). Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage, RLS).

## Getting started

```bash
pnpm install
cp .env.example .env.local      # fill with values from `supabase status`
supabase start                  # local Supabase (Docker)
pnpm db:reset                   # migrations + supabase/seed.sql + seed users
pnpm seed:demo                  # optional: demo courses, edition and enrollments
pnpm dev                        # http://localhost:3000
```

> `pnpm db:reset` wipes the database. Re-run `pnpm seed:demo` after every reset if you want the demo courses back.

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest), `pnpm test:e2e` (Playwright), `pnpm gen:types`.

## Logging in

There are no passwords. Login is a **6-digit email code (OTP)**:

1. Go to `/login` and enter one of the emails below.
2. Open the local mail inbox at **http://localhost:54324** (Inbucket/Mailpit), find the email for that address and copy the code.
3. Enter the code on `/login/verify`. You are sent to your role's home page.

If http://localhost:54324 refuses the connection, local Supabase isn't running. Start Docker, run `supabase start` and wait for the containers to report healthy (`supabase status`).

Login never creates accounts — an unknown email gets "user not found". New accounts are only created through a registration link (see [Registration](#registration-new-students)).

## Test users

All users are created by `scripts/seed-users.ts` (run as part of `pnpm db:reset`).

| Email | Name | Role | Organization | Home |
|---|---|---|---|---|
| `super@enecourses.test` | Super Admin | Platform admin | — (all orgs) | `/platform` |
| `admin@club-a.test` | Ana Admin | Admin | Club Atlético Demo | `/admin` |
| `prof@club-a.test` | Pablo Profesor | Professor | Club Atlético Demo | `/teach` |
| `alum1@club-a.test` | Alumno Uno | Student (Grupo Principal) | Club Atlético Demo | `/learn` |
| `alum2@club-a.test` | Alumno Dos | Student (Grupo Principal) | Club Atlético Demo | `/learn` |
| `alum3@club-a.test` | Alumno Tres | Student (Grupo Principal) | Club Atlético Demo | `/learn` |
| `admin@fed-b.test` | Beatriz Admin | Admin | Federación Demo | `/admin` |
| `prof@fed-b.test` | Bruno Profesor | Professor | Federación Demo | `/teach` |
| `alum1@fed-b.test` | Alumna Uno | Student (Grupo Principal) | Federación Demo | `/learn` |
| `alum2@fed-b.test` | Alumna Dos | Student (Grupo Principal) | Federación Demo | `/learn` |
| `alum3@fed-b.test` | Alumna Tres | Student (Grupo Principal) | Federación Demo | `/learn` |

Use the two organizations to check tenant isolation: nothing from Club Atlético Demo should ever be visible to a Federación Demo user, and vice versa.

### Seed data

From `supabase/seed.sql` (always present after `pnpm db:reset`):

- Organizations **Club Atlético Demo** and **Federación Demo**, timezone `America/Montevideo`, default passing score 60.
- Score scale per org: Excelente (90–100), Muy bueno (80–89), Bueno (70–79), No aprobado (0–69).
- One group per org, **Grupo Principal**.
- One active registration link per org (role Student, expires 30 days after reset): `demo-link-org-a`, `demo-link-org-b`.

From `pnpm seed:demo` (optional):

| Course | Org | Status | Notes |
|---|---|---|---|
| Preparación Física Base | Club Atlético Demo | Published | 3 modules, 4 lessons. Includes: published Tarea "Plan semanal de entrenamiento" (up to 2 files, deadline 14 days from seed, late submissions allowed); the video in lesson "Qué es la preparación física" has 2 in-video questions (at 0:20 and 0:45). The content and the Tarea live in the edition **Cohorte 2026** for Grupo Principal (90 days); a new edition of the same course starts empty (its content is built there, or copied from another edition in a later increment), so the three `alum*@club-a.test` are enrolled; `prof@club-a.test` is assigned to that edition. |
| Nutrición Deportiva | Club Atlético Demo | Draft, empty | Use it to check that publishing a course without content is refused (a FREE course also needs its OPEN edition ACTIVE). |
| Reglamento y Arbitraje | Federación Demo | Published | Use it to check tenant isolation. No professor or edition. |

## Flows by role

Users are sent to one home page based on their role. Opening another role's area redirects to `/forbidden`. A user with no active membership goes to `/register-required`.

### Platform admin — `super@enecourses.test`

| Area | Route | What you can do |
|---|---|---|
| Dashboard | `/platform` | Platform-wide stats across organizations |
| Organizations | `/platform/organizations` | List orgs; create one (`/platform/organizations/new`) |
| Organization detail | `/platform/organizations/[orgId]` | Edit the org, activate/suspend it, see its stats |
| Audit | `/platform/audit` | Audit log across all orgs, filterable by org, action, user and date |

### Admin — `admin@club-a.test`, `admin@fed-b.test`

| Area | Route | What you can do |
|---|---|---|
| Dashboard | `/admin` | Org stats |
| Members | `/admin/members`, `/admin/members/[userId]` | View members; change role (Admin/Professor/Student); activate/deactivate |
| Groups | `/admin/groups`, `/admin/groups/[groupId]` | Create, edit and delete groups; add/remove members |
| Courses | `/admin/courses`, `/admin/courses/new` | Create, edit, publish, archive and delete courses |
| Edition content | Cursos › curso › Ediciones › edición › **Contenido** (`/admin/courses/[id]/offerings/[offeringId]/content` → module → lesson) | Content belongs to each **edition**, not to the course. Drill-down builder: modules (with prerequisite dependencies), lessons, content blocks (text, YouTube video with in-video questions, external link, file); reorder everything |
| Edition evaluations | Cursos › curso › Ediciones › edición › **Evaluaciones** (`.../offerings/[offeringId]/assessments`) | Quizzes, exams and Tareas of that edition only; the edition's content blocks can only point to its own evaluations |
| Editions (Ediciones) | `/admin/courses/[id]/offerings`, `.../offerings/[offeringId]` | Create course editions (for a group or open), set dates and per-module schedule, change status, sync enrollments with the group roster. The list shows group, dates, status, students and professors |
| Edition professors | `.../offerings/[offeringId]/professors` | Professors belong to an **edition**: see the assigned ones ("Quitar"), or search by name or email (max 3 results) and "Asignar" |
| Analytics | `/admin/analytics` | Org, course, professor and assessment stats; score distribution |
| Audit | `/admin/audit` | Org audit log with filters |
| Registration links | `/admin/links` | Create links (role, label, expiry), enable/disable, revoke |
| Settings | `/admin/settings`, `/admin/settings/score-scale` | Timezone and default passing score; edit score scale ranges |

### Professor — `prof@club-a.test`, `prof@fed-b.test`

Only the **editions** the professor is assigned to are visible (students, attempts, grades), and the courses those editions belong to. After `pnpm seed:demo`, `prof@club-a.test` teaches the edition **Cohorte 2026** of **Preparación Física Base**. `prof@fed-b.test` has no edition until an admin assigns one. Content and evaluations are **per edition**: the professor edits only the content and evaluations of the editions they teach (a professor of edition A cannot read or change edition B's content). Question banks stay shared across the course's editions, but a question used by a PUBLISHED evaluation of an edition you don't teach is read-only for you.

| Area | Route | What you can do |
|---|---|---|
| Dashboard | `/teach` | Stats for the professor's courses |
| Courses | `/teach/courses` | Courses where you teach an edition, with the edition names |
| Edition content | `/teach/courses/[id]/editions/[offeringId]/content` → module → lesson | Same content builder as the admin, limited to the edition you teach |
| Assessments (Quiz/Exam) | `/teach/courses/[id]/editions/[offeringId]/assessments`, `.../new`, `.../[assessmentId]` | Create and edit question-based assessments, pick questions, publish, extend the time window for students, delete |
| Preguntas en el video | `/teach/courses/[id]/editions/[offeringId]/content/[moduleId]/[lessonId]` → edit a YouTube block | Pause the preview and "Agregar pregunta en este momento" (up to 20 per video, 1–5 multiple-choice questions each, minimum correct answers); "Estadísticas" tab: how many students reached each point, pass and first-try rates, wrong answers per question and option |
| Tareas (File Submissions) | `/teach/courses/[id]/editions/[offeringId]/assessments/new` (kind=TASK) | Create a Tarea: write instructions, set max files (1–10), set deadline, allow late submissions; publish |
| Question banks | `/teach/banks`, `/teach/banks/[bankId]` | Create and edit banks; create and edit questions; activate/deactivate questions |
| Grading | `/teach/grading`, `/teach/grading/[attemptId]` | Queue of submitted attempts from your editions only, with course, edition and assessment filters (Tareas hidden until deadline passes); grade open answers + Tarea submissions (0–100 + feedback); leave feedback |

### Student — `alum*@club-a.test`, `alum*@fed-b.test`

After `pnpm seed:demo`, the `alum*@club-a.test` students are enrolled in **Preparación Física Base**. The `alum*@fed-b.test` students have no enrollments.

| Area | Route | What you can do |
|---|---|---|
| My courses | `/learn` | Enrolled courses with progress |
| Catalog | `/learn/catalog` | Browse open courses and self-enroll |
| Course | `/learn/courses/[enrollmentId]` | Modules and lessons; prerequisite and schedule locks |
| Lesson | `/learn/courses/[enrollmentId]/lessons/[lessonId]` | View content blocks; mark blocks complete (drives progress) |
| Videos | `/learn/courses/[enrollmentId]/lessons/[lessonId]` | Every required video completes itself when it ends. With in-video questions, the video pauses and hides, a full-screen quiz opens, and on failure the student picks "Volver a ver el fragmento" or "Reintentar"; skipping ahead past a pending question is undone |
| Quiz / Exam attempt | `/learn/assessments/[assessmentId]/start` | Assessment rules, then start an attempt |
| Quiz / Exam player | `/learn/attempts/[attemptId]` | Answer questions (autosave, timer, offline banner), submit; see the score with its scale label, retry if allowed, return to the course |
| Tarea | `/learn/assessments/[assessmentId]/start?enrollment=…` (from the lesson's "Ver tarea" button) | Read the consigna, upload PDF/image/Office files (≤20 MB each), replace until the deadline; status "Entregada"; marked "Fuera de plazo" if submitted late |
| Tarea result | same page, once graded | See score, label and the professor's feedback |

Answer options are shuffled per attempt, so their order changes between attempts. A Tarea can only be graded after its deadline; to try grading the demo one, move its deadline into the past.

### Registration (new students)

1. Log out and open `http://localhost:3000/register/demo-link-org-a` (or `demo-link-org-b`).
2. Enter an email that doesn't exist yet and get the code from http://localhost:54324.
3. Fill in the profile on `/register/[token]/complete`. The new user joins that organization with the link's role (Student) and lands on `/learn`.

An admin can create more links, including for other roles, from `/admin/links`. Expired, disabled or revoked links are refused.

## End-to-end test idea

1. **Professor** (`prof@club-a.test`): in Preparación Física Base › Ediciones › Cohorte 2026 › Evaluaciones, create a question bank with questions, then create and publish an assessment.
2. **Student** (`alum1@club-a.test`): open the course, complete the lessons, take the assessment and submit it.
3. **Professor**: grade any open answers in `/teach/grading`.
4. **Student**: check the result.
5. **Admin** (`admin@club-a.test`): check `/admin/analytics` and `/admin/audit`.
6. **Isolation**: log in as `admin@fed-b.test` and confirm none of the above is visible.

## Docs

More detail in [`docs/`](docs/): [architecture](docs/architecture.md), [authorization](docs/authorization.md), [domain model](docs/domain-model.md), [database schema](docs/database-schema.md), [assessment design](docs/assessment-design.md), [code standards](docs/code-standards.md), [roadmap](docs/roadmap.md).
