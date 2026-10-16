/**
 * Demo showcase for presentations: "Organización Demo" with one user per role
 * and a published course whose single edition uses every content type, quizzes,
 * a task, in-video checkpoints, module dependencies and a final exam.
 *
 * LOCAL ONLY (guarded in showcase-admin-client). Idempotent: users, org and group
 * are upserted; the course is deleted by title and rebuilt on every run.
 *
 * Usage: pnpm seed:showcase
 */
import { admin, must } from "./demo-showcase/showcase-admin-client"
import { SHOWCASE_EXAM, SHOWCASE_MODULES } from "./demo-showcase/showcase-course-content"
import { insertQuestions, writeEditionContent } from "./demo-showcase/showcase-content-writer"

type Role = "ADMIN" | "PROFESSOR" | "STUDENT"

const ORG = { name: "Organización Demo", slug: "organizacion-demo" }
const COURSE = { title: "Entrenamiento Deportivo Integral", description: "Curso completo de preparación física: fundamentos, planificación, fuerza, resistencia, prevención y recuperación." }
const EDITION_NAME = "Edición 2026"
const GROUP_NAME = "Grupo Demo"
const DAY_MS = 86_400_000

const SUPER_ADMIN = { email: "superadmin@test.com", firstName: "Super", lastName: "Admin" }
const MEMBERS: Array<{ email: string; firstName: string; lastName: string; role: Role }> = [
  { email: "admin@test.com", firstName: "Andrea", lastName: "Administradora", role: "ADMIN" },
  { email: "profe@test.com", firstName: "Pablo", lastName: "Profesor", role: "PROFESSOR" },
  { email: "alumno@test.com", firstName: "Lucía", lastName: "Alumna", role: "STUDENT" },
]

async function upsertUser(email: string, firstName: string, lastName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  let userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id
  if (!userId) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
  }
  const profile = await admin.from("profiles").upsert({ id: userId, first_name: firstName, last_name: lastName })
  if (profile.error) throw profile.error
  const privateRow = await admin.from("profile_private").upsert({ user_id: userId, email })
  if (privateRow.error) throw privateRow.error
  return userId
}

/** Mirrors create_organization: org + settings + the default score scale. */
async function upsertOrganization(): Promise<string> {
  const org = must(await admin.from("organizations").upsert({ ...ORG, status: "ACTIVE" }, { onConflict: "slug" }).select("id").single(), "organization")
  const settings = await admin
    .from("organization_settings")
    .upsert({ organization_id: org.id, timezone: "America/Montevideo", default_passing_score: 60 }, { onConflict: "organization_id" })
  if (settings.error) throw settings.error

  const { count } = await admin.from("score_scale_ranges").select("id", { count: "exact", head: true }).eq("organization_id", org.id)
  if (!count) {
    const { error } = await admin.from("score_scale_ranges").insert([
      { organization_id: org.id, min_score: 0, max_score: 59, label: "No aprobado", is_passing: false },
      { organization_id: org.id, min_score: 60, max_score: 79, label: "Bueno", is_passing: true },
      { organization_id: org.id, min_score: 80, max_score: 89, label: "Muy bueno", is_passing: true },
      { organization_id: org.id, min_score: 90, max_score: 100, label: "Excelente", is_passing: true },
    ])
    if (error) throw error
  }
  return org.id
}

async function main(): Promise<void> {
  const superId = await upsertUser(SUPER_ADMIN.email, SUPER_ADMIN.firstName, SUPER_ADMIN.lastName)
  const platform = await admin.from("platform_admins").upsert({ user_id: superId })
  if (platform.error) throw platform.error

  const organizationId = await upsertOrganization()
  const ids: Record<Role, string> = { ADMIN: "", PROFESSOR: "", STUDENT: "" }
  for (const member of MEMBERS) {
    ids[member.role] = await upsertUser(member.email, member.firstName, member.lastName)
    const { error } = await admin
      .from("organization_memberships")
      .upsert({ organization_id: organizationId, user_id: ids[member.role], role: member.role, status: "ACTIVE" }, { onConflict: "organization_id,user_id" })
    if (error) throw error
  }

  const group = must(
    await admin.from("groups").upsert({ organization_id: organizationId, name: GROUP_NAME }, { onConflict: "organization_id,name" }).select("id").single(),
    "group"
  )
  const groupMember = await admin.from("group_members").upsert({ group_id: group.id, user_id: ids.STUDENT }, { onConflict: "group_id,user_id" })
  if (groupMember.error) throw groupMember.error

  await admin.from("courses").delete().eq("organization_id", organizationId).eq("title", COURSE.title)
  const course = must(
    await admin
      .from("courses")
      .insert({ organization_id: organizationId, ...COURSE, status: "PUBLISHED", access_type: "PRIVATE", published_at: new Date().toISOString() })
      .select("id")
      .single(),
    "course"
  )
  const offering = must(
    await admin
      .from("course_offerings")
      .insert({
        course_id: course.id,
        organization_id: organizationId,
        kind: "GROUP",
        group_id: group.id,
        name: EDITION_NAME,
        starts_at: new Date(Date.now() - DAY_MS).toISOString(),
        ends_at: new Date(Date.now() + 120 * DAY_MS).toISOString(),
      })
      .select("id")
      .single(),
    "edition"
  )

  const ctx = { organizationId, courseId: course.id, offeringId: offering.id, createdBy: ids.ADMIN }
  const blocks = await writeEditionContent(ctx, SHOWCASE_MODULES)

  const exam = must(
    await admin
      .from("assessments")
      .insert({
        organization_id: organizationId,
        offering_id: offering.id,
        kind: "EXAM",
        status: "PUBLISHED",
        created_by: ids.ADMIN,
        title: SHOWCASE_EXAM.title,
        description: SHOWCASE_EXAM.description,
        passing_score: SHOWCASE_EXAM.passingScore,
        max_attempts: SHOWCASE_EXAM.maxAttempts,
        duration_seconds: SHOWCASE_EXAM.durationMinutes * 60,
        available_from: new Date(Date.now() - DAY_MS).toISOString(),
        available_until: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      })
      .select("id")
      .single(),
    "exam"
  )
  await insertQuestions(exam.id, SHOWCASE_EXAM.questions)

  const professor = await admin.from("offering_professors").insert({ offering_id: offering.id, user_id: ids.PROFESSOR, assigned_by: ids.ADMIN })
  if (professor.error) throw professor.error

  // Same row sync_offering_enrollments would produce for the group roster.
  const { count: totalBlocks } = await admin
    .from("lesson_content_blocks")
    .select("id, lessons!inner(modules!inner(offering_id))", { count: "exact", head: true })
    .eq("lessons.modules.offering_id", offering.id)
    .eq("is_required", true)
  const enrollment = await admin.from("course_enrollments").insert({
    organization_id: organizationId,
    course_id: course.id,
    offering_id: offering.id,
    user_id: ids.STUDENT,
    source: "GROUP_ASSIGNMENT",
    total_blocks: totalBlocks ?? 0,
  })
  if (enrollment.error) throw enrollment.error

  const lessons = SHOWCASE_MODULES.reduce((sum, m) => sum + m.lessons.length, 0)
  console.log(`✓ ${ORG.name}: superadmin@test.com (platform admin), admin@test.com, profe@test.com, alumno@test.com`)
  console.log(`✓ "${COURSE.title}" → "${EDITION_NAME}": ${SHOWCASE_MODULES.length} módulos, ${lessons} lecciones, ${blocks} bloques`)
  console.log(`✓ Examen final publicado (${SHOWCASE_EXAM.questions.length} preguntas); profe asignado; alumno inscripto`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
