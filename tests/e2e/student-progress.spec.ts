import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { deleteUser, makeUser } from "../helpers/make-user"
import { deleteCourses, enrollStudent, makeCourseFixture, type CourseFixture } from "../helpers/course-fixtures"

/**
 * The completion toggle updates optimistically, so "Completado" appears before
 * the Server Action has committed. Navigating on that signal races the write —
 * poll the row the RPC actually rewrites instead, the same way
 * `course-builder.spec.ts` waits on the enrollment sync.
 */
async function waitForProgress(percent: number): Promise<void> {
  await expect
    .poll(async () => {
      const { data } = await supabaseAdmin
        .from("course_enrollments")
        .select("progress_percent")
        .eq("id", enrollmentId)
        .single()
      return data ? Math.round(Number(data.progress_percent)) : null
    })
    .toBe(percent)
}

/**
 * The student journey end to end: dashboard → course → locked module → complete
 * every block of module 1 → module 2 unlocks → progress reaches 100%.
 *
 * A throwaway student is created for this file: two workers requesting an OTP
 * for the same address invalidate each other's code.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const courseTitle = `Curso estudiante E2E ${Date.now()}`

test.describe.configure({ mode: "serial" })

let page: Page
let studentUserId: string
let fixture: CourseFixture
let enrollmentId: string

test.beforeAll(async ({ browser }) => {
  const student = await makeUser("e2e-student-progress", { organizationId: ORG_A, role: "STUDENT" })
  studentUserId = student.id

  fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title: courseTitle,
    modules: [
      { title: "Módulo uno", requiredBlocks: 2 },
      { title: "Módulo dos", requiredBlocks: 1 },
    ],
  })

  await supabaseAdmin.from("module_dependencies").insert({
    module_id: fixture.modules[1]!.id,
    condition: "MODULE_COMPLETED",
    depends_on_module_id: fixture.modules[0]!.id,
  })

  enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

  page = await browser.newPage()
  await loginViaOtp(page, student.email, "/learn")
})

test.afterAll(async () => {
  await page?.close()
  await deleteCourses([fixture.courseId])
  if (studentUserId) await deleteUser(studentUserId)
})

test("the dashboard lists the assigned course as not started", async () => {
  await page.goto("/learn")
  await expect(page.getByRole("heading", { name: "Cursos", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()
  await expect(page.getByText("Asignado", { exact: true })).toBeVisible()
  // Not started: no progress line yet, the card offers its start action.
  await expect(page.getByRole("button", { name: "Empezar", exact: true })).toBeVisible()
})

test("the second module is locked until the first one is completed", async () => {
  await page.goto(`/learn/courses/${enrollmentId}`)
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()

  await expect(page.getByText("Disponible", { exact: true })).toBeVisible()
  await expect(page.getByText("Bloqueado", { exact: true })).toBeVisible()
  await expect(page.getByText("Primero tenés que completar «Módulo uno»")).toBeVisible()

  // A locked module offers no lesson links at all.
  await expect(page.getByRole("link", { name: /Módulo dos — lección/ })).toBeHidden()
})

test("completing every block of module one unlocks module two", async () => {
  await page.goto(`/learn/courses/${enrollmentId}`)
  await page.getByRole("link", { name: /Módulo uno — lección/ }).click()
  await page.waitForURL(new RegExp(`/learn/courses/${enrollmentId}/lessons/`))

  const toggles = page.getByRole("button", { name: "Marcar como completado" })
  await expect(toggles).toHaveCount(2)

  await toggles.first().click()
  await expect(page.getByRole("button", { name: "Completado" }).first()).toBeVisible()

  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect(page.getByRole("button", { name: "Completado" })).toHaveCount(2)
  await waitForProgress(67)

  await page.getByRole("link", { name: "Volver al curso" }).first().click()
  await page.waitForURL(`/learn/courses/${enrollmentId}`)

  await expect(page.getByText("Completado", { exact: true })).toBeVisible()
  await expect(page.getByText("Bloqueado", { exact: true })).toBeHidden()
  await expect(page.getByText("67% completado")).toBeVisible()
})

test("completing the last module finishes the course", async () => {
  await page.goto(`/learn/courses/${enrollmentId}`)
  await page.getByRole("link", { name: /Módulo dos — lección/ }).click()
  await page.waitForURL(new RegExp(`/learn/courses/${enrollmentId}/lessons/`))

  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect(page.getByRole("button", { name: "Completado" })).toBeVisible()
  await waitForProgress(100)

  // Finished courses sit outside "Todos"; "Mis cursos" lists them with a "Finalizado" badge and no action.
  await page.goto("/learn")
  await page.getByRole("button", { name: "Mis cursos", exact: true }).click()
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: courseTitle }) })
  await expect(card.getByText("Finalizado", { exact: true })).toBeVisible()
  await expect(card.getByRole("button")).toHaveCount(0)
})
