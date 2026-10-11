import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { makeUser, type TestUser } from "../helpers/make-user"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"
import { submitOpenAttempt } from "../helpers/attempt-submission"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.setTimeout(180_000)

interface TranscriptScene {
  admin: TestUser
  professor: TestUser
  student: TestUser
  course: CourseFixture
  enrollmentId: string
  courseTitle: string
  studentName: string
  bankId: string
}

/**
 * Edition in progress: module 1 done (one required block with progress),
 * module 2 not started, and a published EXAM. `submitExam` hands the exam in
 * so the professor has a correction to do. Every name carries a unique suffix
 * so parallel specs never collide in the shared database.
 */
async function buildScene(label: string, submitExam: boolean): Promise<TranscriptScene> {
  const stamp = `${label}${Date.now()}`
  const studentLast = `Escolar${stamp}`
  const admin = await makeUser(`tr-e2e-admin-${stamp}`, { organizationId: ORG_A, role: "ADMIN" })
  const professor = await makeUser(`tr-e2e-prof-${stamp}`, { organizationId: ORG_A, role: "PROFESSOR" })
  const student = await makeUser(`tr-e2e-student-${stamp}`, {
    organizationId: ORG_A,
    role: "STUDENT",
    firstName: "Alumna",
    lastName: studentLast,
  })

  const courseTitle = `Curso escolaridad ${stamp}`
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: courseTitle,
    modules: [
      { title: "Módulo uno", requiredBlocks: 1 },
      { title: "Módulo dos", requiredBlocks: 1 },
    ],
  })
  await assignOfferingProfessor(course.offeringId, professor.id)
  const enrollmentId = await enrollStudent(course, ORG_A, student.id)

  const { error: progressError } = await supabaseAdmin
    .from("content_progress")
    .insert({ enrollment_id: enrollmentId, content_block_id: course.modules[0]!.blockIds[0]! })
  if (progressError) throw progressError

  const exam = await makeAssessmentFixture({
    organizationId: ORG_A,
    offeringId: course.offeringId,
    title: `Examen ${stamp}`,
    kind: "EXAM",
    openEnded: 1,
    durationSeconds: 3600,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3600_000).toISOString(),
    status: "PUBLISHED",
  })
  if (submitExam) {
    await submitOpenAttempt(student, enrollmentId, exam.assessmentId)
  }

  return {
    admin,
    professor,
    student,
    course,
    enrollmentId,
    courseTitle,
    studentName: `Alumna ${studentLast}`,
    bankId: exam.bankId,
  }
}

async function cleanupScene(scene: TranscriptScene): Promise<void> {
  await cleanupFixtures({
    users: [scene.admin.id, scene.professor.id, scene.student.id],
    courseIds: [scene.course.courseId],
    bankIds: [scene.bankId],
  })
}

/** Checks the in-progress card: outcome, the Historial timeline and the Pendiente list. */
async function expectInProgressTranscript(page: Page, scene: TranscriptScene): Promise<void> {
  await expect(page.getByText(scene.courseTitle).first()).toBeVisible()
  await expect(page.getByText("En progreso", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Historial", exact: true })).toBeVisible()
  // Timeline row reads "<event>: <item>" in one element.
  await expect(page.getByText("Módulo completado: Módulo uno", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Pendiente", exact: true })).toBeVisible()
  await expect(page.getByText("Módulo dos", { exact: true })).toBeVisible()
}

test("admin opens a member from /admin/members and sees the in-progress escolaridad", async ({ browser }) => {
  const scene = await buildScene("adm", false)
  const adminPage = await browser.newPage()
  try {
    await loginViaOtp(adminPage, scene.admin.email, "/admin")
    await adminPage.goto(`/admin/members/${scene.student.id}`)

    await expect(adminPage.getByRole("heading", { name: "Escolaridad", exact: true })).toBeVisible()
    await expectInProgressTranscript(adminPage, scene)
    // Exam never handed in: the assessment row reads "Sin entregar" and stays pending.
    await expect(adminPage.getByText("Sin entregar", { exact: true })).toBeVisible()
  } finally {
    await adminPage.close()
    await cleanupScene(scene)
  }
})

test("professor opens a student from the grading queue and sees the escolaridad with the correction link", async ({
  browser,
}) => {
  const scene = await buildScene("qlink", true)
  const professorPage = await browser.newPage()
  try {
    await loginViaOtp(professorPage, scene.professor.email, "/teach")
    await professorPage.goto("/teach/grading")
    await professorPage.getByRole("link", { name: scene.studentName }).click()
    await professorPage.waitForURL(new RegExp(`/teach/students/${scene.student.id}`))

    await expect(professorPage.getByRole("heading", { name: scene.studentName })).toBeVisible()
    await expectInProgressTranscript(professorPage, scene)
    // Handed-in exam: "Por corregir" with a link into the grading panel.
    await expect(professorPage.getByText("Por corregir", { exact: true })).toBeVisible()
    await professorPage.getByRole("link", { name: "Corregir", exact: true }).click()
    await professorPage.waitForURL(/\/teach\/grading\//)
    await expect(professorPage.getByRole("heading", { name: "Corregir entrega" })).toBeVisible()
  } finally {
    await professorPage.close()
    await cleanupScene(scene)
  }
})

test("professor reaches the escolaridad from the Alumnos list with 'Ver escolaridad'", async ({ browser }) => {
  const scene = await buildScene("alist", false)
  const professorPage = await browser.newPage()
  try {
    await loginViaOtp(professorPage, scene.professor.email, "/teach")
    await professorPage.goto("/teach/students")
    await professorPage
      .getByRole("row", { name: scene.studentName })
      .getByRole("link", { name: "Ver escolaridad" })
      .click()
    await professorPage.waitForURL(new RegExp(`/teach/students/${scene.student.id}`))

    await expect(professorPage.getByRole("heading", { name: scene.studentName })).toBeVisible()
    await expectInProgressTranscript(professorPage, scene)
  } finally {
    await professorPage.close()
    await cleanupScene(scene)
  }
})
