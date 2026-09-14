import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser } from "../helpers/make-user"
import { makeCourseFixture, makeAssessmentFixture, enrollStudent, cleanupFixtures } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.describe.configure({ mode: "serial" })
test.setTimeout(180_000)

/** Fails with the offending rule ids/node counts inlined, not just a boolean. */
async function assertNoSeriousViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
  const detail = serious.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes): ${v.help}`).join("\n")
  expect(serious, `${screen} a11y violations:\n${detail}`).toEqual([])
}

test.describe("accessibility (axe) — key screens", () => {
  const courseTitle = `Curso A11y ${Date.now()}`
  let studentId: string
  let professorId: string
  let courseId: string
  const bankIds: string[] = []
  let enrollmentId: string
  let registrationToken: string
  let quizAssessmentId: string
  let lessonId: string

  test.beforeAll(async () => {
    const student = await makeUser("a11y-student", { organizationId: ORG_A, role: "STUDENT" })
    const professor = await makeUser("a11y-prof", { organizationId: ORG_A, role: "PROFESSOR" })
    studentId = student.id
    professorId = professor.id

    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: courseTitle,
      modules: [{ title: "Módulo 1", requiredBlocks: 1 }],
    })
    courseId = fixture.courseId
    lessonId = fixture.modules[0]!.lessonId

    await supabaseAdmin.from("course_professors").insert({ course_id: courseId, user_id: professorId })

    const quiz = await makeAssessmentFixture({
      organizationId: ORG_A,
      courseId,
      title: "Quiz A11y",
      kind: "QUIZ",
      multipleChoice: 2,
      passingScore: 50,
    })
    bankIds.push(quiz.bankId)
    quizAssessmentId = quiz.assessmentId

    const now = new Date()
    const exam = await makeAssessmentFixture({
      organizationId: ORG_A,
      courseId,
      title: "Examen A11y",
      kind: "EXAM",
      multipleChoice: 1,
      openEnded: 1,
      availableFrom: now.toISOString(),
      availableUntil: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      durationSeconds: 600,
      passingScore: 50,
    })
    bankIds.push(exam.bankId)

    await supabaseAdmin.from("lesson_content_blocks").insert({
      lesson_id: lessonId,
      type: "QUIZ",
      position: 2,
      data: {},
      assessment_id: quizAssessmentId,
      is_required: true,
    })

    enrollmentId = await enrollStudent(fixture, ORG_A, studentId)

    const { data: link, error } = await supabaseAdmin
      .from("organization_registration_links")
      .insert({ organization_id: ORG_A, label: "a11y-scan" })
      .select("token")
      .single()
    if (error || !link) throw error ?? new Error("registration link not created")
    registrationToken = link.token
  })

  test.afterAll(async () => {
    await cleanupFixtures({ users: [studentId, professorId], courseIds: [courseId], bankIds })
  })

  test("login screen", async ({ page }) => {
    await page.goto("/login")
    await assertNoSeriousViolations(page, "/login")
  })

  test("registration screen", async ({ page }) => {
    await page.goto(`/register/${registrationToken}`)
    await expect(page.getByRole("heading", { name: "Completar registro" })).toBeVisible()
    await assertNoSeriousViolations(page, "/register/[token]")
  })

  test("student dashboard, course detail, lesson player and quiz attempt player", async ({ page }) => {
    // makeUser generates a random throwaway email — fetch it back rather than guessing it.
    const { data: privateProfile } = await supabaseAdmin
      .from("profile_private")
      .select("email")
      .eq("user_id", studentId)
      .single()
    await loginViaOtp(page, privateProfile!.email, "/learn")

    await assertNoSeriousViolations(page, "/learn")

    await page.goto(`/learn/courses/${enrollmentId}`)
    await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()
    await assertNoSeriousViolations(page, "/learn/courses/[enrollmentId]")

    await page.goto(`/learn/courses/${enrollmentId}/lessons/${lessonId}`)
    await assertNoSeriousViolations(page, "/learn/courses/[enrollmentId]/lessons/[lessonId]")

    // Start the quiz attempt through the real UI so the player is scanned mid-attempt.
    const quizStart = page.getByRole("button", { name: "Comenzar" }).first()
    await quizStart.click()
    await page.waitForURL(/\/learn\/assessments\/.*\/start/)
    await page.getByRole("button", { name: "Comenzar" }).click()
    await page.waitForURL(/\/learn\/attempts\//)
    await expect(page.locator("text=/respondidas/")).toBeVisible()
    await assertNoSeriousViolations(page, "/learn/attempts/[attemptId] (quiz, in progress)")

    // Manual keyboard pass: radios are grouped, reachable, and operable by keyboard.
    const radioGroup = page.getByRole("radiogroup").first()
    await expect(radioGroup).toBeVisible()
    const firstRadio = page.getByRole("radio").first()
    await firstRadio.focus()
    await expect(firstRadio).toBeFocused()
    await page.keyboard.press("Space")
    await expect(firstRadio).toBeChecked()
  })

  test("admin course content builder", async ({ page }) => {
    const admin = await makeUser("a11y-admin", { organizationId: ORG_A, role: "ADMIN" })
    try {
      await loginViaOtp(page, admin.email, "/admin")
      await page.goto(`/admin/courses/${courseId}/content`)
      await assertNoSeriousViolations(page, "/admin/courses/[courseId]/content")
    } finally {
      await supabaseAdmin.auth.admin.deleteUser(admin.id)
    }
  })

  test("professor grading panel (submitted open answer)", async ({ browser }) => {
    const { data: studentEmail } = await supabaseAdmin
      .from("profile_private")
      .select("email")
      .eq("user_id", studentId)
      .single()
    const { data: profEmail } = await supabaseAdmin
      .from("profile_private")
      .select("email")
      .eq("user_id", professorId)
      .single()

    // `browser.newContext()` + `.newPage()`, not `browser.newPage()` — AxeBuilder's
    // popup-based scan technique needs a context created explicitly (axe-core-npm
    // error-handling.md: "Please use browser.newContext()").
    const studentContext = await browser.newContext()
    const professorContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    const professorPage = await professorContext.newPage()
    try {
      await loginViaOtp(studentPage, studentEmail!.email, "/learn")
      await studentPage.goto(`/learn/courses/${enrollmentId}`)
      const examCard = studentPage.locator("li").filter({ hasText: "Examen A11y" })
      await examCard.getByRole("button", { name: "Comenzar" }).click()
      await studentPage.waitForURL(/\/learn\/assessments\/.*\/start/)
      await studentPage.getByRole("button", { name: "Comenzar" }).click()
      await studentPage.waitForURL(/\/learn\/attempts\//)
      await expect(studentPage.locator("text=/respondidas/")).toBeVisible()

      await studentPage.getByRole("radio").first().click()
      const textarea = studentPage.locator("textarea").first()
      await textarea.fill("Respuesta abierta para la revisión de accesibilidad.")
      await expect(studentPage.locator("text=/Guardado/")).toBeVisible()

      await studentPage.getByRole("button", { name: "Entregar" }).click()
      await studentPage.getByRole("button", { name: "Sí, entregar" }).click()
      await expect(studentPage.locator("text=/Pendiente de corrección/")).toBeVisible()

      await loginViaOtp(professorPage, profEmail!.email, "/teach")
      await professorPage.goto("/teach/grading")
      await professorPage.getByRole("button", { name: "Corregir" }).first().click()
      await professorPage.waitForURL(/\/teach\/grading\//)
      await expect(professorPage.getByRole("heading", { name: "Corregir entrega" })).toBeVisible()

      await assertNoSeriousViolations(professorPage, "/teach/grading/[attemptId]")
    } finally {
      await studentContext.close()
      await professorContext.close()
    }
  })
})
