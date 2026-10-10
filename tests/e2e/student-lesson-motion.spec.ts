import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { deleteUser, makeUser } from "../helpers/make-user"
import { deleteCourses, enrollStudent, makeCourseFixture } from "../helpers/course-fixtures"

/**
 * Student lesson experience (motion + feedback): lesson progress fills, the
 * "Lección completada" / "Módulo completado" moments appear, typed navigation
 * still lands on the right lesson, and reduced motion collapses animations.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const stamp = Date.now()
const courseIds: string[] = []
const users: string[] = []

test.afterAll(async () => {
  await deleteCourses(courseIds)
  for (const id of users) await deleteUser(id)
})

async function makeTwoLessonCourse() {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso movimiento ${stamp}`,
    modules: [{ title: "Módulo movimiento", requiredBlocks: 1 }],
  })
  courseIds.push(fixture.courseId)

  // makeCourseFixture builds one lesson per module; add a second one by hand.
  const { data: lesson } = await supabaseAdmin
    .from("lessons")
    .insert({ module_id: fixture.modules[0]!.id, title: "Lección dos", position: 2 })
    .select("id")
    .single()
  await supabaseAdmin.from("lesson_content_blocks").insert({
    lesson_id: lesson!.id,
    type: "RICH_TEXT",
    position: 1,
    data: { html: "<p>bloque dos</p>" },
    is_required: true,
  })
  return { fixture, secondLessonId: lesson!.id }
}

test("completing lessons fills progress and shows the lesson, then module, completion moment", async ({ page }) => {
  const student = await makeUser(`e2e-motion-${stamp}`, { organizationId: ORG_A, role: "STUDENT" })
  users.push(student.id)
  const { fixture, secondLessonId } = await makeTwoLessonCourse()
  const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

  await loginViaOtp(page, student.email, "/learn")
  await page.goto(`/learn/courses/${enrollmentId}`)
  await expect(page.locator('li[data-state="AVAILABLE"]')).toBeVisible()
  await page.getByRole("link", { name: /Módulo movimiento — lección/ }).click()
  await page.waitForURL(`**/lessons/${fixture.modules[0]!.lessonId}`)

  const lessonProgress = page.getByRole("progressbar", { name: "Progreso de la lección" })
  await expect(lessonProgress).toHaveAttribute("aria-valuenow", "0")
  await expect(page.getByText("Lección completada")).toBeHidden()

  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect(page.getByText("Lección completada")).toBeVisible()
  await expect(lessonProgress).toHaveAttribute("aria-valuenow", "100")
  await expect(page.getByText("Seguí con la próxima lección.")).toBeVisible()

  await page.getByRole("link", { name: "Siguiente lección" }).click()
  await page.waitForURL(`**/lessons/${secondLessonId}`)
  await expect(page.getByRole("heading", { name: "Lección dos" })).toBeVisible()

  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect(page.getByText("Módulo completado")).toBeVisible()

  // Back on the course page the module now reads as completed.
  await page.getByRole("link", { name: "Volver al curso" }).last().click()
  await page.waitForURL(`**/learn/courses/${enrollmentId}`)
  await expect(page.locator('li[data-state="COMPLETED"]')).toBeVisible()
})

test("reduced motion collapses the lesson animations", async ({ page }) => {
  const student = await makeUser(`e2e-motion-rm-${stamp}`, { organizationId: ORG_A, role: "STUDENT" })
  users.push(student.id)
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso movimiento reducido ${stamp}`,
    modules: [{ title: "Módulo reducido", requiredBlocks: 2 }],
  })
  courseIds.push(fixture.courseId)
  const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

  await page.emulateMedia({ reducedMotion: "reduce" })
  await loginViaOtp(page, student.email, "/learn")
  await page.goto(`/learn/courses/${enrollmentId}/lessons/${fixture.modules[0]!.lessonId}`)

  const duration = await page
    .locator(".stagger-item")
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))
  expect(duration).toBeLessThan(0.001)
})
