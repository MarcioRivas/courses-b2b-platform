import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser } from "../helpers/make-user"
import { makeCourseFixture, enrollStudent, makeAssessmentFixture, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")

test.setTimeout(180_000)

test("task submission: student uploads a PDF → professor grades after the deadline → student sees the grade", async ({
  browser,
}) => {
  const stamp = Date.now()
  const student = await makeUser(`e2e-task-student-${stamp}`, { organizationId: ORG_A, role: "STUDENT" })
  const professor = await makeUser(`e2e-task-prof-${stamp}`, { organizationId: ORG_A, role: "PROFESSOR" })
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso tarea E2E ${stamp}`,
    modules: [{ title: "Módulo 1", requiredBlocks: 1 }],
  })
  await assignOfferingProfessor(course.offeringId, professor.id)

  const task = await makeAssessmentFixture({
    organizationId: ORG_A,
    courseId: course.courseId,
    title: "Tarea de planificación",
    kind: "TASK",
    instructions: "Armá un microciclo semanal y subilo en PDF.",
    maxFiles: 2,
  })
  const enrollmentId = await enrollStudent(course, ORG_A, student.id)

  try {
    // Student: open the task, upload a PDF, submit.
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    await loginViaOtp(studentPage, student.email, "/learn")
    await studentPage.goto(`/learn/assessments/${task.assessmentId}/start?enrollment=${enrollmentId}`)
    await expect(studentPage.getByText("Armá un microciclo semanal y subilo en PDF.")).toBeVisible()

    await studentPage
      .locator('input[type="file"]')
      .setInputFiles({ name: "microciclo.pdf", mimeType: "application/pdf", buffer: PDF })
    await expect(studentPage.getByText("microciclo.pdf")).toBeVisible()
    await studentPage.getByRole("button", { name: "Entregar" }).click()
    await expect(studentPage.getByText("Entrega recibida.")).toBeVisible()
    await expect(studentPage.getByText("Entregada", { exact: true })).toBeVisible()

    const { data: attempt } = await supabaseAdmin
      .from("assessment_attempts")
      .select("id")
      .eq("assessment_id", task.assessmentId)
      .eq("enrollment_id", enrollmentId)
      .single()
    expect(attempt).not.toBeNull()

    // The deadline passes: grading opens.
    await supabaseAdmin
      .from("assessments")
      .update({ available_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", task.assessmentId)

    // Professor: grade 85 with feedback.
    const professorContext = await browser.newContext()
    const professorPage = await professorContext.newPage()
    await loginViaOtp(professorPage, professor.email, "/teach")
    await professorPage.goto(`/teach/grading/${attempt!.id}`)
    await expect(professorPage.getByText("microciclo.pdf")).toBeVisible()
    await professorPage.getByLabel("Nota (0 a 100)").fill("85")
    await professorPage.getByLabel("Devolución para el estudiante").fill("Muy bien organizado.")
    await professorPage.getByRole("button", { name: "Guardar corrección" }).click()
    await expect(professorPage.getByText("Corrección guardada.")).toBeVisible()

    // Student: sees the grade, label and feedback; the upload area is gone.
    await studentPage.reload()
    await expect(studentPage.getByText("85% · Muy bueno")).toBeVisible()
    await expect(studentPage.getByText("Muy bien organizado.")).toBeVisible()
    await expect(studentPage.getByRole("button", { name: "Reemplazar entrega" })).toBeHidden()

    await studentContext.close()
    await professorContext.close()
  } finally {
    const { data: files } = await supabaseAdmin.storage
      .from("task-submissions")
      .list(`${ORG_A}/${course.courseId}/${task.assessmentId}/${enrollmentId}`)
    const paths = (files ?? []).map((f) => `${ORG_A}/${course.courseId}/${task.assessmentId}/${enrollmentId}/${f.name}`)
    if (paths.length > 0) {
      await supabaseAdmin.storage.from("task-submissions").remove(paths)
    }
    await cleanupFixtures({ users: [student.id, professor.id], courseIds: [course.courseId], bankIds: [task.bankId] })
  }
})
