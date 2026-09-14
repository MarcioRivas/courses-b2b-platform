import { randomUUID } from "node:crypto"
import { deleteUser, makeUser, type TestUser } from "../helpers/make-user"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  type AssessmentFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"

/**
 * Shared 2-org / 7-user fixture for the Phase 7 security suites
 * (rls-matrix, rpc-permissions, privilege-escalation, storage-policies).
 *
 * Deliberately builds two SCRATCH organizations rather than reusing the
 * globally seeded org A/B — this suite performs real INSERT/UPDATE/DELETE
 * against tenancy tables (organizations, groups, score ranges, ...) and must
 * never mutate rows other parallel Phase 7 suites (a11y/E2E, audit UI) or
 * `scripts/seed-users.ts` depend on.
 */

export type Role7 = "superAdmin" | "adminA" | "profA" | "studentA" | "adminB" | "profB" | "studentB"

export interface SecurityFixture {
  orgA: string
  orgB: string
  users: Record<Role7, TestUser>
  courseA: CourseFixture
  courseB: CourseFixture
  enrollmentA: string
  enrollmentB: string
  membershipStudentA: string
  membershipStudentB: string
  progressA: string
  progressB: string
  assessmentA: AssessmentFixture
  assessmentB: AssessmentFixture
  /** MULTIPLE_CHOICE question in bankA/bankB not attached to assessmentA/B — a fresh assessment_questions insert target. */
  spareQuestionA: string
  spareQuestionB: string
  attemptA: string
  attemptB: string
  /** attempt-question ids for the graded OPEN_ENDED and MULTIPLE_CHOICE questions. */
  attemptQuestionOpenA: string
  attemptQuestionOpenB: string
  attemptQuestionMcA: string
  attemptQuestionMcB: string
  gradeA: string
  gradeB: string
  feedbackA: string
  feedbackB: string
  groupA: string
  groupB: string
  groupMemberA: string
  groupMemberB: string
  spareCourseA: string
  spareGroupA: string
  moduleDependencyA: string
  scheduleA: string
  scoreRangeA: string
  linkA: { id: string; token: string }
  linkB: { id: string; token: string }
  auditLogA: number
  cleanup: () => Promise<void>
}

async function makeOrg(name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .insert({ name, slug: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, status: "ACTIVE" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("org not created")
  await supabaseAdmin.from("organization_settings").insert({ organization_id: data.id })
  await supabaseAdmin
    .from("score_scale_ranges")
    .insert({ organization_id: data.id, min_score: 60, max_score: 100, label: "Aprobado", is_passing: true })
  return data.id
}

/**
 * Starts an attempt, answers every question (MC picks the first option),
 * submits, then has `professor` grade the open answer + leave feedback so
 * `assessment_grades`/`assessment_feedback` have real rows to target.
 */
async function submitFullAttempt(
  student: TestUser,
  professor: TestUser,
  enrollmentId: string,
  assessmentId: string
): Promise<{ attemptId: string; openAttemptQuestionId: string; mcAttemptQuestionId: string }> {
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")

  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

  const { data: questions } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id, type, options")
    .eq("attempt_id", attemptId)
    .order("position")

  const rows = questions ?? []
  const answers = rows.map((q, i) => {
    if (q.type === "MULTIPLE_CHOICE") {
      const options = q.options as { id: string; label: string }[]
      return { attempt_question_id: q.id, selected_option_id: options[0]!.id, client_seq: i + 1 }
    }
    return { attempt_question_id: q.id, text_answer: "respuesta de prueba", client_seq: i + 1 }
  })

  await student.client.rpc("submit_attempt", { p_attempt: attemptId, p_session: session, p_answers: answers })

  const openAttemptQuestionId = rows.find((q) => q.type === "OPEN_ENDED")!.id
  const mcAttemptQuestionId = rows.find((q) => q.type === "MULTIPLE_CHOICE")!.id

  await professor.client.rpc("grade_open_answer", {
    p_attempt: attemptId,
    p_attempt_question: openAttemptQuestionId,
    p_points: 1,
    p_feedback: "Buen trabajo.",
  })
  await professor.client.rpc("upsert_attempt_feedback", { p_attempt: attemptId, p_feedback: "Comentario general." })

  return { attemptId, openAttemptQuestionId, mcAttemptQuestionId }
}

export async function buildSecurityFixture(): Promise<SecurityFixture> {
  const orgA = await makeOrg("Sec Org A")
  const orgB = await makeOrg("Sec Org B")

  const userIds: string[] = []
  async function member(label: string, org: string, role: "ADMIN" | "PROFESSOR" | "STUDENT"): Promise<TestUser> {
    const user = await makeUser(label, { organizationId: org, role })
    userIds.push(user.id)
    return user
  }

  const superAdmin = await makeUser("sec-super-admin")
  userIds.push(superAdmin.id)
  await supabaseAdmin.from("platform_admins").insert({ user_id: superAdmin.id })

  const adminA = await member("sec-admin-a", orgA, "ADMIN")
  const profA = await member("sec-prof-a", orgA, "PROFESSOR")
  const studentA = await member("sec-student-a", orgA, "STUDENT")
  const adminB = await member("sec-admin-b", orgB, "ADMIN")
  const profB = await member("sec-prof-b", orgB, "PROFESSOR")
  const studentB = await member("sec-student-b", orgB, "STUDENT")

  const courseIds: string[] = []
  const bankIds: string[] = []

  async function buildSide(org: string, professor: TestUser, student: TestUser) {
    const course = await makeCourseFixture({
      organizationId: org,
      title: `Sec Curso ${org.slice(0, 8)}`,
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(course.courseId)
    await supabaseAdmin.from("course_professors").insert({ course_id: course.courseId, user_id: professor.id })

    const enrollmentId = await enrollStudent(course, org, student.id)

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", org)
      .eq("user_id", student.id)
      .single()
    if (membershipError || !membership) throw membershipError ?? new Error("membership not found")

    const { data: progress, error: progressError } = await supabaseAdmin
      .from("content_progress")
      .insert({ enrollment_id: enrollmentId, content_block_id: course.modules[0]!.blockIds[0]! })
      .select("id")
      .single()
    if (progressError || !progress) throw progressError ?? new Error("progress not created")

    const assessment = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: org,
      title: `Sec Evaluación ${org.slice(0, 8)}`,
      kind: "TASK",
      multipleChoice: 1,
      openEnded: 1,
    })
    bankIds.push(assessment.bankId)

    const { data: spareQuestion, error: spareQuestionError } = await supabaseAdmin
      .from("questions")
      .insert({
        question_bank_id: assessment.bankId,
        organization_id: org,
        type: "MULTIPLE_CHOICE",
        prompt: "Pregunta de repuesto",
        default_points: 1,
      })
      .select("id")
      .single()
    if (spareQuestionError || !spareQuestion) throw spareQuestionError ?? new Error("spare question not created")

    const { attemptId, openAttemptQuestionId, mcAttemptQuestionId } = await submitFullAttempt(
      student,
      professor,
      enrollmentId,
      assessment.assessmentId
    )

    const { data: grade, error: gradeError } = await supabaseAdmin
      .from("assessment_grades")
      .select("id")
      .eq("attempt_id", attemptId)
      .eq("attempt_question_id", openAttemptQuestionId)
      .single()
    if (gradeError || !grade) throw gradeError ?? new Error("grade not found")

    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("assessment_feedback")
      .select("id")
      .eq("attempt_id", attemptId)
      .single()
    if (feedbackError || !feedback) throw feedbackError ?? new Error("feedback not found")

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .insert({ organization_id: org, name: `Sec Grupo ${org.slice(0, 8)}` })
      .select("id")
      .single()
    if (groupError || !group) throw groupError ?? new Error("group not created")
    const { data: groupMember, error: groupMemberError } = await supabaseAdmin
      .from("group_members")
      .insert({ group_id: group.id, user_id: student.id })
      .select("id")
      .single()
    if (groupMemberError || !groupMember) throw groupMemberError ?? new Error("group member not created")

    const { data: link, error: linkError } = await supabaseAdmin
      .from("organization_registration_links")
      .insert({ organization_id: org, label: "Sec link", default_role: "STUDENT" })
      .select("id, token")
      .single()
    if (linkError || !link) throw linkError ?? new Error("link not created")

    return {
      course,
      enrollmentId,
      membershipId: membership.id,
      progressId: progress.id,
      assessment,
      spareQuestionId: spareQuestion.id,
      attemptId,
      openAttemptQuestionId,
      mcAttemptQuestionId,
      gradeId: grade.id,
      feedbackId: feedback.id,
      groupId: group.id,
      groupMemberId: groupMember.id,
      link,
    }
  }

  const [sideA, sideB] = await Promise.all([
    buildSide(orgA, profA, studentA),
    buildSide(orgB, profB, studentB),
  ])

  const { error: auditError } = await adminA.client.rpc("log_audit", {
    p_org: orgA,
    p_action: "test.matrix_seed",
    p_entity_type: "organization",
    p_entity_id: orgA,
  })
  if (auditError) throw auditError
  const { data: auditLog, error: auditLogError } = await supabaseAdmin
    .from("audit_logs")
    .select("id")
    .eq("organization_id", orgA)
    .eq("action", "test.matrix_seed")
    .single()
  if (auditLogError || !auditLog) throw auditLogError ?? new Error("audit log not found")

  const { data: dependency, error: dependencyError } = await supabaseAdmin
    .from("module_dependencies")
    .insert({
      module_id: sideA.course.modules[1]!.id,
      depends_on_module_id: sideA.course.modules[0]!.id,
      condition: "MODULE_COMPLETED",
    })
    .select("id")
    .single()
  if (dependencyError || !dependency) throw dependencyError ?? new Error("dependency not created")

  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from("offering_module_schedules")
    .insert({ offering_id: sideA.course.offeringId, module_id: sideA.course.modules[0]!.id })
    .select("id")
    .single()
  if (scheduleError || !schedule) throw scheduleError ?? new Error("schedule not created")

  const { data: scoreRange } = await supabaseAdmin
    .from("score_scale_ranges")
    .select("id")
    .eq("organization_id", orgA)
    .limit(1)
    .single()

  // Untouched course/group in org A — insert targets for course_professors /
  // group_members "allowed" cases, kept empty so unique-constraint / trigger
  // preconditions (no prior assignment) always hold.
  const { data: spareCourse, error: spareCourseError } = await supabaseAdmin
    .from("courses")
    .insert({ organization_id: orgA, title: "Sec Curso repuesto", status: "PUBLISHED", access_type: "PRIVATE" })
    .select("id")
    .single()
  if (spareCourseError || !spareCourse) throw spareCourseError ?? new Error("spare course not created")
  courseIds.push(spareCourse.id)

  const { data: spareGroup, error: spareGroupError } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: orgA, name: "Sec Grupo repuesto" })
    .select("id")
    .single()
  if (spareGroupError || !spareGroup) throw spareGroupError ?? new Error("spare group not created")

  return {
    orgA,
    orgB,
    users: { superAdmin, adminA, profA, studentA, adminB, profB, studentB },
    courseA: sideA.course,
    courseB: sideB.course,
    enrollmentA: sideA.enrollmentId,
    enrollmentB: sideB.enrollmentId,
    membershipStudentA: sideA.membershipId,
    membershipStudentB: sideB.membershipId,
    progressA: sideA.progressId,
    progressB: sideB.progressId,
    assessmentA: sideA.assessment,
    assessmentB: sideB.assessment,
    spareQuestionA: sideA.spareQuestionId,
    spareQuestionB: sideB.spareQuestionId,
    attemptA: sideA.attemptId,
    attemptB: sideB.attemptId,
    attemptQuestionOpenA: sideA.openAttemptQuestionId,
    attemptQuestionOpenB: sideB.openAttemptQuestionId,
    attemptQuestionMcA: sideA.mcAttemptQuestionId,
    attemptQuestionMcB: sideB.mcAttemptQuestionId,
    gradeA: sideA.gradeId,
    gradeB: sideB.gradeId,
    feedbackA: sideA.feedbackId,
    feedbackB: sideB.feedbackId,
    groupA: sideA.groupId,
    groupB: sideB.groupId,
    groupMemberA: sideA.groupMemberId,
    groupMemberB: sideB.groupMemberId,
    spareCourseA: spareCourse.id,
    spareGroupA: spareGroup.id,
    moduleDependencyA: dependency.id,
    scheduleA: schedule.id,
    scoreRangeA: scoreRange!.id,
    linkA: sideA.link,
    linkB: sideB.link,
    auditLogA: auditLog.id,
    cleanup: async () => {
      for (const id of userIds) await deleteUser(id)
      if (courseIds.length > 0) await supabaseAdmin.from("courses").delete().in("id", courseIds)
      if (bankIds.length > 0) await supabaseAdmin.from("question_banks").delete().in("id", bankIds)
      await supabaseAdmin.from("organizations").delete().in("id", [orgA, orgB])
    },
  }
}
