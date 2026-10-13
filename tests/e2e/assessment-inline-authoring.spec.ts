import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { deleteUser, makeUser } from "../helpers/make-user"
import { cleanupFixtures, makeCourseFixture, type CourseFixture } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const quizTitle = `Cuestionario inline ${Date.now()}`

let adminId: string
let course: CourseFixture

test.beforeAll(async () => {
  course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso inline E2E ${Date.now()}`,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
})

test.afterAll(async () => {
  await cleanupFixtures({ users: adminId ? [adminId] : [], courseIds: [course.courseId] })
  if (adminId) await deleteUser(adminId)
})

test("a quiz is created inside the lesson, step by step: config, questions, publish", async ({ page }) => {
  const admin = await makeUser("e2e-inline-quiz", { organizationId: ORG_A, role: "ADMIN" })
  adminId = admin.id
  await loginViaOtp(page, admin.email, "/admin")

  const lesson = course.modules[0]!
  await page.goto(`/admin/courses/${course.courseId}/offerings/${course.offeringId}/content/${lesson.id}/${lesson.lessonId}`)

  await page.getByRole("button", { name: "Agregar contenido" }).click()
  await page.getByRole("button", { name: "Cuestionario" }).click()

  // Step 1: configuration only.
  await expect(page.getByText("Las preguntas las agregás en el próximo paso.")).toBeVisible()
  await page.getByLabel("Título").fill(quizTitle)
  await page.getByRole("button", { name: "Guardar y continuar" }).click()

  // Step 2: questions, authored in place.
  await page.getByRole("button", { name: "Agregar la primera pregunta" }).click()
  await page.getByLabel("Enunciado").fill("¿Cuál es la capital de Uruguay?")
  const options = page.getByPlaceholder("Texto de la opción")
  await options.nth(0).fill("Montevideo")
  await options.nth(1).fill("Salto")

  await page.getByRole("button", { name: "Desarrollo" }).click()
  await page.getByLabel("Enunciado").fill("Explicá qué es una entrada en calor.")

  await page.getByRole("button", { name: "Guardar y continuar" }).click()

  // Step 3: review and publish.
  await expect(page.getByText("Tiene al menos una pregunta")).toBeVisible()
  await page.getByRole("button", { name: "Publicar", exact: true }).click()
  await expect(page.getByText("Evaluación publicada.")).toBeVisible()
  // Toasts stack over the bottom-right footer; use the keyboard like a user could.
  await page.getByRole("button", { name: "Listo", exact: true }).press("Enter")

  // Back on the lesson: the block shows its quiz.
  const block = page.getByRole("listitem").filter({ hasText: quizTitle })
  await expect(block).toContainText("2 preguntas")
  await expect(block).toContainText("Publicada")

  const { data: assessment } = await supabaseAdmin
    .from("assessments")
    .select("status, questions(type)")
    .eq("title", quizTitle)
    .single()
  expect(assessment?.status).toBe("PUBLISHED")
  expect(assessment?.questions.map((q) => q.type).sort()).toEqual(["MULTIPLE_CHOICE", "OPEN_ENDED"])
})
