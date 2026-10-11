import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { generateOtp } from "../helpers/otp"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser, deleteUser, deleteUserByEmail } from "../helpers/make-user"
import { previewAndConfirmGrade } from "../helpers/grading-e2e"
import { makeAssessmentFixture, cleanupFixtures} from "../helpers/course-fixtures"
import {
  buildJourneyCourse,
  gateModuleOnQuiz,
  createRegistrationLink,
  enrollViaGroupOffering,
  userIdByEmail,
  JOURNEY_ORG,
} from "../helpers/journey-fixtures"

test.setTimeout(240_000)
test.describe.configure({ mode: "serial" })

test("full student journey: register → progress → quiz unlocks module 2 → exam with offline segment → grading", async ({
  browser,
}) => {
  const courseTitle = `Curso Jornada ${Date.now()}`
  const studentEmail = `test+journey-student-${Date.now()}@enecourses.test`

  const admin = await makeUser("journey-admin", { organizationId: JOURNEY_ORG, role: "ADMIN" })
  const professor = await makeUser("journey-prof", { organizationId: JOURNEY_ORG, role: "PROFESSOR" })
  const course = await buildJourneyCourse(courseTitle)

  const quiz = await makeAssessmentFixture({
    organizationId: JOURNEY_ORG,
    offeringId: course.offeringId,
    title: "Quiz Jornada",
    kind: "QUIZ",
    multipleChoice: 2,
    passingScore: 50,
  })
  // Optional block: passing it is what gates module 2, not a module-1 completion requirement.
  await supabaseAdmin.from("lesson_content_blocks").insert({
    lesson_id: course.module1LessonId,
    type: "QUIZ",
    position: 2,
    data: {},
    assessment_id: quiz.assessmentId,
    is_required: false,
  })
  await gateModuleOnQuiz(course.module2Id, quiz.assessmentId, 50)

  const now = new Date()
  const exam = await makeAssessmentFixture({
    organizationId: JOURNEY_ORG,
    offeringId: course.offeringId,
    title: "Examen Jornada",
    kind: "EXAM",
    multipleChoice: 1,
    openEnded: 1,
    availableFrom: now.toISOString(),
    availableUntil: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
    durationSeconds: 1200,
    passingScore: 50,
  })

  const token = await createRegistrationLink()

  const adminPage = await browser.newPage()
  const studentPage = await browser.newPage()
  const professorPage = await browser.newPage()
  let studentId = ""

  try {
    // ===== Admin publishes the course (fixture-built module/lesson/block; see journey-fixtures.ts) =====
    await loginViaOtp(adminPage, admin.email, "/admin")
    await adminPage.goto(`/admin/courses/${course.courseId}`)
    await adminPage.getByRole("button", { name: "Publicar" }).first().click()
    await adminPage.getByRole("dialog", { name: "Publicar curso" }).getByRole("button", { name: "Publicar" }).click()
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("courses").select("status").eq("id", course.courseId).single()
        return data?.status
      })
      .toBe("PUBLISHED")

    // ===== Student registers via the link, then admin enrolls them through a group + offering =====
    await studentPage.goto(`/register/${token}`)
    await studentPage.getByLabel("Correo electrónico").fill(studentEmail)
    await studentPage.getByRole("button", { name: "Enviar código" }).click()
    await studentPage.waitForURL(/\/login\/verify/)
    const otp = await generateOtp(studentEmail)
    await studentPage.getByLabel("Código de verificación").fill(otp)
    await studentPage.getByRole("button", { name: "Verificar" }).click()
    await studentPage.waitForURL(new RegExp(`/register/${token}/complete`))
    await studentPage.getByLabel("Nombre").fill("Estudiante")
    await studentPage.getByLabel("Apellido").fill("Jornada")
    await studentPage.getByLabel("Teléfono").fill("099000000")
    await studentPage.getByLabel("DNI").fill("87654321")
    await studentPage.getByRole("button", { name: "Finalizar registro" }).click()
    await studentPage.waitForURL("/learn")

    studentId = userIdByEmail(studentEmail)
    const enrollmentId = await enrollViaGroupOffering(course, studentId, admin.client, professor.id)

    // ===== Module 1: complete the required block =====
    await studentPage.goto(`/learn/courses/${enrollmentId}`)
    await expect(studentPage.getByRole("heading", { name: courseTitle })).toBeVisible()
    const module2Item = studentPage.locator("li").filter({ hasText: "Módulo 2" })
    await expect(module2Item.getByRole("link")).toHaveCount(0) // locked: no lesson link yet

    await studentPage.locator("li").filter({ hasText: "Módulo 1" }).getByRole("link").first().click()
    await studentPage.waitForURL(/\/lessons\//)
    await studentPage.getByRole("button", { name: "Marcar como completado" }).click()
    await expect(studentPage.getByRole("button", { name: "Completado" })).toBeVisible()

    // ===== Quiz: pass it, which unlocks module 2 =====
    const quizBlock = studentPage.locator("li").filter({ hasText: "Quiz Jornada" })
    await quizBlock.getByRole("button", { name: "Comenzar" }).click()
    await studentPage.waitForURL(/\/learn\/assessments\/.*\/start/)
    await studentPage.getByRole("button", { name: "Comenzar" }).click()
    await studentPage.waitForURL(/\/learn\/attempts\//)
    await expect(studentPage.locator("text=/respondidas/")).toBeVisible()
    // Option order is shuffled per attempt; the fixture marks "Opción 1" as the
    // correct answer, so pick it by name in every question, never by index.
    for (const group of await studentPage.getByRole("radiogroup").all()) {
      await group.getByRole("radio", { name: "Opción 1" }).click()
    }
    await studentPage.getByRole("button", { name: "Entregar" }).click()
    await studentPage.getByRole("button", { name: "Sí, entregar" }).click()
    await expect(studentPage.getByText(/\d+([,.]\d+)?\s?%/).first()).toBeVisible()

    // Poll with a reload: under a loaded shared local Postgres (e.g. the full
    // suite running in parallel) the grade write and the next RSC render can
    // trail the submit response by more than one request.
    await expect
      .poll(
        async () => {
          await studentPage.goto(`/learn/courses/${enrollmentId}`)
          return studentPage.locator("li").filter({ hasText: "Módulo 2" }).getByRole("link").count()
        },
        { timeout: 20000 }
      )
      .toBe(1)

    // ===== Exam: answer, drop offline mid-attempt (answers kept, banner shown), reconnect, submit =====
    await studentPage.getByRole("button", { name: "Comenzar" }).click()
    await studentPage.waitForURL(/\/learn\/assessments\/.*\/start/)
    await studentPage.getByRole("heading", { name: "Examen Jornada" }).waitFor()
    await studentPage.getByRole("button", { name: "Comenzar" }).click()
    await studentPage.waitForURL(/\/learn\/attempts\//)
    await expect(studentPage.locator("text=/respondidas/")).toBeVisible()

    await studentPage.getByRole("radio").first().click()

    await studentPage.context().setOffline(true)
    await expect(studentPage.getByText("Conexión no disponible")).toBeVisible()
    const examTextarea = studentPage.locator("textarea").first()
    await examTextarea.fill("Mi respuesta escrita mientras estaba desconectado.")
    await studentPage.waitForTimeout(5000)
    await expect(examTextarea).toHaveValue(/desconectado/) // nothing discarded while offline

    await studentPage.context().setOffline(false)
    await expect(studentPage.getByText("Conexión no disponible")).toBeHidden()
    await expect(studentPage.locator("text=/Guardado/")).toBeVisible({ timeout: 15000 })

    await studentPage.getByRole("button", { name: "Entregar" }).click()
    await studentPage.getByRole("button", { name: "Sí, entregar" }).click()
    await expect(studentPage.locator("text=/Pendiente de corrección/")).toBeVisible()

    // ===== Professor grades the open answer and leaves feedback =====
    await loginViaOtp(professorPage, professor.email, "/teach")
    await professorPage.goto("/teach/grading")
    // Scoped to the journey student's row: parallel specs share the DB, so the
    // queue's first pending item may belong to a different attempt (L8).
    await professorPage
      .getByRole("row", { name: "Estudiante Jornada" })
      .getByRole("button", { name: "Corregir" })
      .click()
    await professorPage.waitForURL(/\/teach\/grading\//)
    await professorPage.locator('input[type="number"]').first().fill("0.9")
    await professorPage.locator("textarea").first().fill("Buen desarrollo.")
    await professorPage.locator("textarea").last().fill("Felicitaciones, aprobaste el examen.")
    await previewAndConfirmGrade(professorPage)

    // ===== Student sees the graded score, label and feedback =====
    await studentPage.reload()
    await expect(studentPage.getByText(/\d+([,.]\d+)?\s?%/).first()).toBeVisible()
    await expect(studentPage.getByText("Felicitaciones, aprobaste el examen.")).toBeVisible()
  } finally {
    await adminPage.close()
    await studentPage.close()
    await professorPage.close()
    if (studentId) await deleteUser(studentId)
    else await deleteUserByEmail(studentEmail)
    await cleanupFixtures({ users: [admin.id, professor.id], courseIds: [course.courseId], bankIds: [quiz.bankId, exam.bankId] })
  }
})
