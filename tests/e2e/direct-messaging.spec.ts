import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { loginViaOtp } from "../helpers/e2e-login"
import { deleteUser, makeUser } from "../helpers/make-user"
import { deleteCourses, enrollStudent, makeCourseFixture } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.setTimeout(180_000)

test("direct messaging: header chats panel, docked window, live badge and reply", async ({ browser }) => {
  const stamp = Date.now()
  const student = await makeUser(`e2e-dm-student-${stamp}`, {
    organizationId: ORG_A,
    role: "STUDENT",
    firstName: "Alumna",
    lastName: `Chat${stamp}`,
  })
  const professor = await makeUser(`e2e-dm-prof-${stamp}`, {
    organizationId: ORG_A,
    role: "PROFESSOR",
    firstName: "Profe",
    lastName: `Chat${stamp}`,
  })
  // One course the student is enrolled in: gives "Cursos" a course page to navigate away to.
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso chat ${stamp}`,
    modules: [{ title: "Módulo chat", requiredBlocks: 1 }],
  })
  await enrollStudent(course, ORG_A, student.id)
  const professorName = `Profe Chat${stamp}`
  const studentName = `Alumna Chat${stamp}`
  const question = "Hola profe, ¿mañana hay entrenamiento?"
  const answer = "Sí, a las 18 en la cancha 2."

  try {
    // The professor is already in the app before anything is sent: the red badge must appear live.
    const professorContext = await browser.newContext()
    const professorPage = await professorContext.newPage()
    await loginViaOtp(professorPage, professor.email, "/teach")
    await expect(professorPage.getByRole("button", { name: "Chats", exact: true })).toBeVisible()

    // Student: header icon → panel → search the professor → chat window opens at the bottom.
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()
    await loginViaOtp(studentPage, student.email, "/learn")
    await studentPage.getByRole("button", { name: "Chats", exact: true }).click()
    await expect(studentPage.getByRole("tab", { name: "Todos" })).toBeVisible()
    await expect(studentPage.getByText("Todavía no tenés conversaciones.")).toBeVisible()

    await studentPage.getByLabel("Buscar miembros de tu organización").fill(`Chat${stamp}`)
    await studentPage.getByRole("button", { name: new RegExp(professorName) }).click()
    const studentWindow = studentPage.getByRole("region", { name: `Chat con ${professorName}` })
    await expect(studentWindow.getByRole("heading", { name: professorName })).toBeVisible()
    // The panel closes once a chat is picked.
    await expect(studentPage.getByLabel("Buscar miembros de tu organización")).toBeHidden()

    const results = await new AxeBuilder({ page: studentPage }).analyze()
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary}`).join(" | ")}`)).toEqual([])

    // Enter sends (the composer is focused on open).
    const composer = studentWindow.getByLabel("Escribí un mensaje")
    await expect(composer).toBeFocused()
    await composer.fill(question)
    await composer.press("Enter")
    await expect(studentWindow.getByText(question, { exact: true })).toBeVisible()
    await expect(composer).toHaveValue("")

    // Professor: the badge counts it without a reload; "No leídos" lists it; opening clears it.
    const unreadButton = professorPage.getByRole("button", { name: "Chats (1 mensaje sin leer)" })
    await expect(unreadButton).toBeVisible({ timeout: 15_000 })
    await unreadButton.click()
    await professorPage.getByRole("tab", { name: "No leídos" }).click()
    // The row reads name, preview, time and "1 mensaje sin leer" to screen readers.
    await professorPage
      .getByRole("button", { name: new RegExp(`^${studentName} ${question.replace("?", "\\?")}.*1 mensaje sin leer$`) })
      .click()
    const professorWindow = professorPage.getByRole("region", { name: `Chat con ${studentName}` })
    await expect(professorWindow.getByText(question, { exact: true })).toBeVisible()
    await expect(professorPage.getByRole("button", { name: "Chats", exact: true })).toBeVisible({ timeout: 15_000 })

    // Reply: the student's open window receives it live, announced once for screen readers.
    const reply = professorWindow.getByLabel("Escribí un mensaje")
    await reply.fill(answer)
    await reply.press("Enter")
    await expect(studentWindow.getByText(answer, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(studentWindow.getByText(`${professorName}: ${answer}`)).toBeAttached()

    // Minimize to a bubble, reopen from it: the history is still there.
    await studentWindow.getByRole("button", { name: `Minimizar chat con ${professorName}` }).click()
    await expect(studentWindow).toBeHidden()
    await studentPage.getByRole("button", { name: `Abrir chat con ${professorName}` }).click()
    await expect(studentWindow.getByText(answer, { exact: true })).toBeVisible()

    // The chat window survives navigation inside the area: open the course, then back to "Cursos".
    await studentPage.getByRole("button", { name: "Empezar", exact: true }).click()
    await studentPage.waitForURL(/\/learn\/courses\//)
    await expect(studentWindow.getByText(answer, { exact: true })).toBeVisible()

    // Sidebar entry only: the breadcrumb on the course page is also named "Cursos".
    await studentPage.getByRole("complementary").getByRole("link", { name: "Cursos", exact: true }).click()
    await studentPage.waitForURL(/\/learn$/)
    await expect(studentWindow.getByText(answer, { exact: true })).toBeVisible()

    await studentContext.close()
    await professorContext.close()
  } finally {
    await deleteCourses([course.courseId])
    await deleteUser(student.id)
    await deleteUser(professor.id)
  }
})
