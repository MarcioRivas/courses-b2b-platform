# Kururu

Multi-tenant LMS for sports organizations (clubs, federations). Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage, RLS).

## Getting started

```bash
pnpm install
cp .env.example .env.local      # fill with values from `supabase status`
supabase start                  # local Supabase (Docker)
pnpm db:reset                   # migrations + supabase/seed.sql + seed users
pnpm seed:demo                  # optional: demo courses, edition and enrollments
pnpm seed:showcase              # optional: "Organización Demo" for presentations (see below)
pnpm dev                        # http://localhost:3000
```

> `pnpm db:reset` wipes the database. Re-run `pnpm seed:demo` / `pnpm seed:showcase` after every reset if you want the demo data back.

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
| `super@kururu.test` | Super Admin | Platform admin | — (all orgs) | `/platform` |
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
| Preparación Física Base | Club Atlético Demo | Published | 3 modules, 4 lessons. Includes: published Tarea "Plan semanal de entrenamiento" (up to 2 files, deadline 14 days from seed, late submissions allowed); the video in lesson "Qué es la preparación física" has 2 in-video questions (at 0:20 and 0:45). The content and the Tarea live in the edition **Cohorte 2026** for Grupo Principal (90 days); the edition **Cohorte 2026 B** (Grupo Cohorte 2026 B) is a copy of it made with "Copiar de otra edición" (its copied evaluations stay as drafts, and its group has no students yet). The three `alum*@club-a.test` are enrolled in Cohorte 2026; `prof@club-a.test` is assigned to that edition. |
| Nutrición Deportiva | Club Atlético Demo | Draft, empty | Use it to check that publishing a course without content is refused (a FREE course also needs its OPEN edition ACTIVE). |
| Reglamento y Arbitraje | Federación Demo | Published | Use it to check tenant isolation. No professor or edition. |

### Showcase for presentations (`pnpm seed:showcase`)

`scripts/seed-demo-showcase.ts` builds a self-contained demo org. It **only runs against a local Supabase** (it refuses any other URL) and is idempotent: users, org and group are upserted, the course is deleted and rebuilt on every run, so re-running it also resets the student's progress. The walkthrough script for a live demo is [`docs/demo-guion-presentacion.md`](docs/demo-guion-presentacion.md).

| Email | Role in **Organización Demo** |
|---|---|
| `superadmin@test.com` | Platform admin |
| `admin@test.com` | Admin |
| `profe@test.com` | Professor, assigned to the edition |
| `alumno@test.com` | Student (Grupo Demo), enrolled in the edition |

Course **Entrenamiento Deportivo Integral**, edition **Edición 2026**: 8 modules, 15 lessons, 29 blocks covering every block type (text, YouTube video, external link, PDF, image, quiz, task). The video in "Principios del entrenamiento" has in-video questions at 0:30 and 1:30; "Lecturas recomendadas" is optional content. Module dependencies: *Fuerza y potencia* after *Planificación*; *Resistencia* after passing the Fisiología quiz (≥ 60); *Nutrición y recuperación* after *Prevención de lesiones*; *Integración final* after *Fuerza* and *Nutrición*. A published **Examen final** (5 questions, 30 min, 2 attempts) lives in the edition's Exámenes tab. Content lives in `scripts/demo-showcase/showcase-course-content.ts`; images and PDF in `scripts/demo-showcase/assets/`.

## Flows by role

Users are sent to one home page based on their role. Opening another role's area redirects to `/forbidden`. A user with no active membership goes to `/register-required`.

### Platform admin — `super@kururu.test`

| Area | Route | What you can do |
|---|---|---|
| Dashboard | `/platform` | Platform-wide stats across organizations |
| Organizations | `/platform/organizations` | List orgs; create one (`/platform/organizations/new`) |
| Organization detail | `/platform/organizations/[orgId]` | Edit the org, activate/suspend it, see its stats |
| Audit | `/platform/audit` | Audit log across all orgs, filterable by org, action, user and date |

### Admin — `admin@club-a.test`, `admin@fed-b.test`

| Area | Route | What you can do |
|---|---|---|
| Home | `/admin` | Welcome (stats live under Estadísticas) |
| Members | `/admin/members`, `/admin/members/[userId]` | View members; change role (Admin/Professor/Student); activate/deactivate; edit profile data (first/last name, phone, DNI); a student's **Escolaridad** (transcript: every edition with grades) |
| Groups | `/admin/groups`, `/admin/groups/[groupId]` | Create, edit and delete groups; add/remove members |
| Courses | `/admin/courses`, `/admin/courses/new` | Create, edit, publish, archive and delete courses |
| Edition content | Cursos › curso › Ediciones › edición › **Contenido** (`/admin/courses/[id]/offerings/[offeringId]/content` → module → lesson) | Content belongs to each **edition**, not to the course. Drill-down builder: modules (with prerequisite dependencies), lessons, content blocks (text, YouTube video with in-video questions, external link, PDF, image, **Cuestionario** and **Tarea**); reorder everything. A Cuestionario or Tarea block is created with a step-by-step wizard (Configuración → Preguntas / Consigna → Revisar y publicar); its questions live on the evaluation itself — there are no shared question banks |
| Edition exams | Cursos › curso › Ediciones › edición › **Exámenes** (`.../offerings/[offeringId]/exams`, `.../exams/new`, `.../exams/[assessmentId]`) | Exams of that edition (not tied to a lesson): same wizard, time limit, attempts and availability window; publish, extend the window, delete |
| Editions (Ediciones) | `/admin/courses/[id]/offerings`, `.../offerings/[offeringId]` | Create a GROUP edition (**Nueva edición**: name, group, dates, and content either **empty** or **copied from another edition** of the course; copied evaluations arrive as DRAFT, professors/students/schedules are not copied; FREE courses have a single OPEN edition and the tab goes straight to it), set dates and per-module schedule, change status, sync enrollments with the group roster. The list shows group, dates, status, students and professors |
| Edition professors | `.../offerings/[offeringId]/professors` | Professors belong to an **edition**: see the assigned ones ("Quitar"), or search by name or email (max 3 results) and "Asignar" |
| Analytics | `/admin/analytics` | Org, course, professor and assessment stats; score distribution; **Por edición** table (one row per edition, filter by course with `?course=`). Each edition's Detalle tab has its own stats card |
| Audit | `/admin/audit` | Org audit log with filters |
| Registration links | `/admin/links` | Create links (role, label, expiry, max uses; empty = unlimited), enable/disable, revoke |
| Settings | `/admin/settings`, `/admin/settings/score-scale` | Timezone and default passing score; edit score scale ranges |

### Professor — `prof@club-a.test`, `prof@fed-b.test`

Only the **editions** the professor is assigned to are visible (students, attempts, grades), and the courses those editions belong to. After `pnpm seed:demo`, `prof@club-a.test` teaches the edition **Cohorte 2026** of **Preparación Física Base**. `prof@fed-b.test` has no edition until an admin assigns one. Content and evaluations are **per edition**: the professor edits only the content and evaluations of the editions they teach (a professor of edition A cannot read or change edition B's content).

| Area | Route | What you can do |
|---|---|---|
| Dashboard | `/teach` | Stats per edition you teach (one row per edition) |
| Courses | `/teach/courses` | Courses where you teach an edition, with the edition names |
| Edition content | `/teach/courses/[id]/editions/[offeringId]/content` → module → lesson | Same content builder as the admin, limited to the edition you teach |
| Cuestionarios and Tareas | Edition content → lesson → **Agregar contenido** → Cuestionario / Tarea | Created inline from the lesson with the wizard: write the questions (multiple choice or open) or the consigna (max files 1–10, deadline, late submissions), then publish |
| Exams | `/teach/courses/[id]/editions/[offeringId]/exams`, `.../new`, `.../[assessmentId]` | Create and edit edition exams with their own questions, publish, extend the time window for students, delete |
| Preguntas en el video | `/teach/courses/[id]/editions/[offeringId]/content/[moduleId]/[lessonId]` → edit a YouTube block | Pause the preview and "Agregar pregunta en este momento" (up to 20 per video, 1–5 multiple-choice questions each, minimum correct answers); "Estadísticas" tab: how many students reached each point, pass and first-try rates, wrong answers per question and option |
| Grading | `/teach/grading`, `/teach/grading/[attemptId]` | Queue of submitted attempts from your editions only, with course, edition and assessment filters (Tareas hidden until deadline passes); grade open answers + Tarea submissions (0–100 + feedback) with a single save and a score preview |
| Students | `/teach/students`, `/teach/students/[userId]` | Students of your editions and their **Escolaridad** |

### Student — `alum*@club-a.test`, `alum*@fed-b.test`

After `pnpm seed:demo`, the `alum*@club-a.test` students are enrolled in **Preparación Física Base**. The `alum*@fed-b.test` students have no enrollments.

| Area | Route | What you can do |
|---|---|---|
| My courses | `/learn` | Enrolled courses with progress |
| Cursos gratuitos | `/learn/catalog` | Browse open (FREE) courses and self-enroll |
| Course | `/learn/courses/[enrollmentId]` | Modules and lessons; prerequisite and schedule locks (each locked module says why); **Evaluaciones** section with the edition's exams |
| Lesson | `/learn/courses/[enrollmentId]/lessons/[lessonId]` | View content blocks; mark blocks complete (drives progress) |
| Videos | `/learn/courses/[enrollmentId]/lessons/[lessonId]` | Every required video completes itself when it ends. With in-video questions, the video pauses and hides, a full-screen quiz opens, and on failure the student picks "Volver a ver el fragmento" or "Reintentar"; skipping ahead past a pending question is undone |
| Quiz / Exam attempt | `/learn/assessments/[assessmentId]/start` | Assessment rules, then start an attempt |
| Quiz / Exam player | `/learn/attempts/[attemptId]` | Answer questions (autosave, timer, offline banner), submit; see the score with its scale label, retry if allowed, return to the course |
| Tarea | `/learn/assessments/[assessmentId]/start?enrollment=…` (from the lesson's "Ver tarea" button) | Read the consigna, upload PDF/image/Office files (≤20 MB each), replace until the deadline; status "Entregada"; marked "Fuera de plazo" if submitted late |
| Tarea result | same page, once graded | See score, label and the professor's feedback |

Answer options are shuffled per attempt, so their order changes between attempts. A Tarea can only be graded after its deadline; to try grading the demo one, move its deadline into the past.

### Messaging (all roles)

The **Chats** icon in the header opens direct 1:1 messages with members of your own organization (text only, unread badge, docked chat windows).

### Registration (new students)

1. Log out and open `http://localhost:3000/register/demo-link-org-a` (or `demo-link-org-b`).
2. Enter an email that doesn't exist yet and get the code from http://localhost:54324.
3. Fill in the profile on `/register/[token]/complete`. The new user joins that organization with the link's role (Student) and lands on `/learn`.

An admin can create more links, including for other roles, from `/admin/links`. Expired, disabled or revoked links are refused.

## End-to-end test idea

1. **Professor** (`prof@club-a.test`): in Preparación Física Base › Ediciones › Cohorte 2026 › Contenido, add a Cuestionario to a lesson with the wizard and publish it (or create an exam in the Exámenes tab).
2. **Student** (`alum1@club-a.test`): open the course, complete the lessons, take the assessment and submit it.
3. **Professor**: grade any open answers in `/teach/grading`.
4. **Student**: check the result.
5. **Admin** (`admin@club-a.test`): check `/admin/analytics` and `/admin/audit`.
6. **Isolation**: log in as `admin@fed-b.test` and confirm none of the above is visible.

## Deploy

Production runs on **Vercel** (Next.js) + a hosted **Supabase** project, served at **https://kururu.academy**.

1. `supabase link --project-ref <ref>` then `supabase db push` (all migrations). Never run `seed.sql`, `seed-users.ts`, `seed:demo` or `seed:showcase` against it.
2. Supabase dashboard: Auth URL configuration (Site URL `https://kururu.academy` + redirect URLs `https://kururu.academy/**` and `https://<app>.vercel.app/**`), Email OTP length **6**, email templates (Magic Link + Confirm signup) showing `{{ .Token }}`, custom SMTP for real users: **Resend** (domain `kururu.academy`, DNS records in Vercel DNS) → host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key, sender `no-reply@kururu.academy`; raise the auth email rate limit. The app itself never sends mail (only Supabase Auth does), so there is no Resend key in the app env.
3. Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SITE_URL` as **Config**; `SUPABASE_SERVICE_ROLE_KEY` as **Secret**. Keep the values locally in `.env.production.local` (gitignored).
4. First user: `pnpm admin:create <email> <firstName> <lastName>` creates a platform admin using `.env.production.local`; organizations are created from there.

## Docs

More detail in [`docs/`](docs/): [architecture](docs/architecture.md), [authorization](docs/authorization.md), [domain model](docs/domain-model.md), [database schema](docs/database-schema.md), [assessment design](docs/assessment-design.md), [code standards](docs/code-standards.md), [roadmap](docs/roadmap.md).
