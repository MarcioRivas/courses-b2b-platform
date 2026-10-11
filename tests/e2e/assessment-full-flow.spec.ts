import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser } from "../helpers/make-user"
import { previewAndConfirmGrade } from "../helpers/grading-e2e"
import {
  makeCourseFixture,
  enrollStudent,
  makeAssessmentFixture,
  cleanupFixtures,
  assignOfferingProfessor,
} from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.setTimeout(180_000)
test.describe.configure({ mode: "serial" })

test("assessment full flow: student quiz → score; exam → save → reload → submit → grade", async ({ browser }) => {
  const courseTitle = `Curso E2E ${Date.now()}`
  const student = await makeUser(`e2e-assess-student-${Date.now()}`, { organizationId: ORG_A, role: "STUDENT" })
  const professor = await makeUser(`e2e-assess-prof-${Date.now()}`, { organizationId: ORG_A, role: "PROFESSOR" })

  // Create course with 1 module
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title: courseTitle,
    modules: [{ title: "Módulo 1", requiredBlocks: 1 }],
  })

  // Add professor to course so they can grade
  await assignOfferingProfessor(fixture.offeringId, professor.id)

  // Create quiz: 2 MC, pass if 50%
  const quiz = await makeAssessmentFixture({
    organizationId: ORG_A,
    offeringId: fixture.offeringId,
    title: "Quiz de prueba",
    kind: "QUIZ",
    multipleChoice: 2,
    passingScore: 50,
    status: "PUBLISHED",
  })

  // Create exam: 1 MC + 1 open-ended
  const now = new Date()
  const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const exam = await makeAssessmentFixture({
    organizationId: ORG_A,
    offeringId: fixture.offeringId,
    title: "Examen de prueba",
    kind: "EXAM",
    multipleChoice: 1,
    openEnded: 1,
    availableFrom: now.toISOString(),
    availableUntil: tenMinutesLater,
    durationSeconds: 600,
    passingScore: 50,
    status: "PUBLISHED",
  })

  // Create lesson block for the quiz (position 2, since position 1 is the RICH_TEXT block)
  await supabaseAdmin.from("lesson_content_blocks").insert({
    lesson_id: fixture.modules[0]!.lessonId,
    type: "QUIZ",
    position: 2,
    data: {},
    assessment_id: quiz.assessmentId,
    is_required: true,
  })

  const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

  const studentPage = await browser.newPage()
  const professorPage = await browser.newPage()

  try {
    await loginViaOtp(studentPage, student.email, "/learn")
    await loginViaOtp(professorPage, professor.email, "/teach")

    // ===== QUIZ FLOW =====
    await studentPage.goto(`/learn/courses/${enrollmentId}`)
    await expect(studentPage.getByRole("heading", { name: courseTitle })).toBeVisible()

    // Navigate to the lesson to see the quiz block
    const lessonLink = studentPage.getByRole("link").filter({ hasText: /Módulo 1 — lección/ })
    await expect(lessonLink).toBeVisible()
    await lessonLink.click()

    // Land on lesson page
    await studentPage.waitForURL(/\/learn\/courses\/.*\/lessons\//)

    // Find and click the quiz block's "Comenzar" button
    const quizBlock = studentPage.locator("li").filter({ hasText: "Quiz de prueba" })
    await expect(quizBlock).toBeVisible()

    const quizStartBtn = quizBlock.getByRole("button", { name: "Comenzar" })
    await expect(quizStartBtn).toBeVisible()
    await quizStartBtn.click()

    // Land on quiz preflight page
    await studentPage.waitForURL(/\/learn\/assessments\/.*\/start/)

    // Click "Comenzar" button to start the attempt
    const preflightStart = studentPage.getByRole("button", { name: "Comenzar" })
    await expect(preflightStart).toBeVisible()
    await preflightStart.click()

    // Land in attempt player
    await studentPage.waitForURL(/\/learn\/attempts\//)
    // Wait for the questions to be rendered (look for the "respondidas" indicator)
    await expect(studentPage.locator("text=/respondidas/")).toBeVisible()

    // Answer both MC questions by clicking the first option for each
    // Use getByRole("radio") to get visible radios only (avoids aria-hidden inputs)
    const radios = studentPage.getByRole("radio")
    await radios.nth(0).click()  // First option of question 1
    await radios.nth(3).click()  // First option of question 2 (after Q1's 3 options)

    // Submit the quiz via dialog
    const submitBtn = studentPage.getByRole("button", { name: "Entregar" })
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Confirm submit
    await studentPage.getByRole("button", { name: "Sí, entregar" }).click()

    // MC-only quiz is GRADED on submit: the result card shows the percent right away
    await expect(studentPage.getByText("Resultado", { exact: true })).toBeVisible()
    await expect(studentPage.getByText(/\d+([,.]\d+)?\s?%/).first()).toBeVisible()

    // ===== EXAM FLOW =====
    await studentPage.goto(`/learn/courses/${enrollmentId}`)
    await expect(studentPage.getByRole("heading", { name: courseTitle })).toBeVisible()

    // Find the exam link in the Evaluaciones section and click it
    const examCard = studentPage.locator("li").filter({ hasText: "Examen de prueba" })
    await expect(examCard).toBeVisible()
    await examCard.getByRole("button", { name: "Comenzar" }).click()

    // Should land on exam preflight page
    await studentPage.waitForURL(/\/learn\/assessments\/.*\/start/)
    await expect(studentPage.getByRole("heading", { name: "Examen de prueba" })).toBeVisible()

    // Click "Comenzar" button
    const examStartButton = studentPage.getByRole("button", { name: "Comenzar" })
    await expect(examStartButton).toBeVisible()
    await examStartButton.click()

    // Wait for player to load
    await studentPage.waitForURL(/\/learn\/attempts\//)
    // Wait for the questions to render
    await expect(studentPage.locator("text=/respondidas/")).toBeVisible()

    // Answer MC: click first option. The whole option row is the label, and the
    // chosen row is highlighted (border + tint) while the others stay plain.
    await studentPage.getByRole("radio").nth(0).click()
    const optionRows = studentPage.locator("label:has([role=radio])")
    const rowBorder = (index: number) =>
      optionRows.nth(index).evaluate((element) => getComputedStyle(element).borderColor)
    await expect.poll(async () => (await rowBorder(0)) !== (await rowBorder(1))).toBe(true)

    // Answer open-ended: fill textarea
    const textarea = studentPage.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await textarea.fill("Esta es mi respuesta de prueba para la pregunta abierta")

    // Wait for save indicator "Guardado"
    await expect(studentPage.locator("text=/Guardado/")).toBeVisible()

    // Reload and verify answers persist
    await studentPage.reload()
    await studentPage.waitForLoadState("networkidle")

    // Check radio is still selected (by finding checked input)
    const checkedRadio = studentPage.getByRole("radio", { checked: true })
    await expect(checkedRadio).toHaveCount(1)

    // Check textarea still has text
    const reloadedTextarea = studentPage.locator('textarea').first()
    const textValue = await reloadedTextarea.inputValue()
    expect(textValue).toContain("respuesta de prueba")

    // Submit the exam
    const examSubmitBtn = studentPage.getByRole("button", { name: "Entregar" })
    await expect(examSubmitBtn).toBeVisible()
    await examSubmitBtn.click()

    // Confirm submit
    await studentPage.getByRole("button", { name: "Sí, entregar" }).click()

    // Verify "Pendiente de corrección"
    await expect(studentPage.locator("text=/Pendiente de corrección/")).toBeVisible()

    // ===== PROFESSOR GRADING =====
    await professorPage.goto("/teach/grading")
    await expect(professorPage.getByRole("heading", { name: "Correcciones" })).toBeVisible()

    // Find the "Corregir" button for the exam attempt
    // The DataList should have a row with the exam, click the "Corregir" button
    const gradeButtons = professorPage.getByRole("button", { name: "Corregir" })
    await expect(gradeButtons.first()).toBeVisible()
    await gradeButtons.first().click()

    // Wait for grading panel
    await professorPage.waitForURL(/\/teach\/grading\//)
    await expect(professorPage.getByRole("heading", { name: "Corregir entrega" })).toBeVisible()

    // Find and fill the points input for the open-ended question
    const pointsLabels = professorPage.getByText(/Puntos/)
    await expect(pointsLabels.first()).toBeVisible()

    const pointsInput = professorPage.locator('input[type="number"]').first()
    await expect(pointsInput).toBeVisible()
    await pointsInput.fill("0.8")

    // Answer feedback (first textarea) and the overall feedback (last textarea)
    await professorPage.locator("textarea").first().fill("Excelente trabajo, bien estructurado.")
    await professorPage.locator("textarea").last().fill("Felicidades, aprobaste el examen.")

    // One "Guardar": preview modal, then confirm; the modal and the saved summary must agree
    await previewAndConfirmGrade(professorPage)

    // ===== STUDENT VIEWS GRADED RESULT =====
    await studentPage.reload()
    await studentPage.waitForLoadState("networkidle")

    // Should see the resolved percent and the professor's overall feedback
    await expect(studentPage.getByText(/\d+([,.]\d+)?\s?%/).first()).toBeVisible()
    await expect(studentPage.getByText("Felicidades, aprobaste el examen.")).toBeVisible()
  } finally {
    await studentPage.close()
    await professorPage.close()
    await cleanupFixtures({
      users: [student.id, professor.id],
      courseIds: [fixture.courseId],
    })
  }
})
