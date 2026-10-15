import { test, expect, type Locator, type Page } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { deleteUser, makeUser } from "../helpers/make-user"
import { deleteCourses, enrollStudent, makeCourseFixture, type CourseFixture } from "../helpers/course-fixtures"

/**
 * The student "Cursos" screen (/learn): the catalog redirect, org isolation of
 * the free courses, one-click enrollment, search, filters that survive a round
 * trip through a course, and the "Continuar" deep link.
 *
 * Serial: the steps build on one student's state (enroll → search → resume).
 * A throwaway student is used because OTP requests for one address race.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"
const stamp = Date.now()

test.describe.configure({ mode: "serial" })

let page: Page
let studentUserId: string
let studentEmail: string
let freeA: CourseFixture
let freeC: CourseFixture
let freeBTitle: string
let inProgress: CourseFixture
let inProgressEnrollmentId: string
let inProgressTitle: string
const freeATitle = `Curso libre A ${stamp}`
const freeCTitle = `Curso libre C ${stamp}`
const courseIds: string[] = []

/** The course card (an article) whose title heading matches. */
function cardOf(title: string): Locator {
  return page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) })
}

test.beforeAll(async ({ browser }) => {
  const student = await makeUser("e2e-courses-screen", { organizationId: ORG_A, role: "STUDENT" })
  studentUserId = student.id
  studentEmail = student.email

  freeA = await makeCourseFixture({
    organizationId: ORG_A,
    title: freeATitle,
    accessType: "FREE",
    modules: [
      { title: "Módulo libre A1", requiredBlocks: 1 },
      { title: "Módulo libre A2", requiredBlocks: 1 },
    ],
  })
  freeC = await makeCourseFixture({
    organizationId: ORG_A,
    title: freeCTitle,
    accessType: "FREE",
    modules: [{ title: "Módulo libre C1", requiredBlocks: 1 }],
  })
  // Another organization's free course: must never reach this student's list.
  freeBTitle = `Curso ajeno B ${stamp}`
  const otherOrg = await makeCourseFixture({
    organizationId: ORG_B,
    title: freeBTitle,
    accessType: "FREE",
    modules: [{ title: "Módulo ajeno", requiredBlocks: 1 }],
  })

  // An assigned (PRIVATE) course the student is already in, not started yet.
  inProgressTitle = `Curso asignado E2E ${stamp}`
  inProgress = await makeCourseFixture({
    organizationId: ORG_A,
    title: inProgressTitle,
    modules: [
      { title: "Módulo uno", requiredBlocks: 1 },
      { title: "Módulo dos", requiredBlocks: 1 },
    ],
  })
  inProgressEnrollmentId = await enrollStudent(inProgress, ORG_A, student.id)

  courseIds.push(freeA.courseId, freeC.courseId, inProgress.courseId, otherOrg.courseId)

  page = await browser.newPage()
  await loginViaOtp(page, studentEmail, "/learn")
})

test.afterAll(async () => {
  await page?.close()
  await deleteCourses(courseIds)
  if (studentUserId) await deleteUser(studentUserId)
})

test("/learn/catalog redirects to the Disponibles view", async () => {
  await page.goto("/learn/catalog")
  await page.waitForURL(/\/learn\?vista=disponibles$/)
  await expect(page.getByRole("button", { name: "Disponibles", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("another organization's free course is never shown", async () => {
  await page.goto("/learn?vista=disponibles")
  // Positive control: the org's own free course is listed, so the empty check below means something.
  await expect(cardOf(freeATitle)).toBeVisible()
  await expect(page.getByText(freeBTitle, { exact: true })).toBeHidden()

  await page.goto("/learn")
  await expect(cardOf(freeATitle)).toBeVisible()
  await expect(page.getByText(freeBTitle, { exact: true })).toBeHidden()
})

test("one click enrolls: the toast confirms and the course becomes Empezar", async () => {
  await page.goto("/learn?vista=disponibles")
  await cardOf(freeATitle).getByRole("button", { name: "Inscribirme", exact: true }).click()

  await expect(page.getByText(`Te inscribiste en ${freeATitle}`)).toBeVisible()

  // Enrolled courses leave "Disponibles", so the screen follows the course to "Todos".
  await expect(page.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(cardOf(freeATitle).getByRole("button", { name: "Empezar", exact: true })).toBeVisible()
})

test("a search with no results says so and Limpiar filtros resets the screen", async () => {
  await page.goto("/learn")
  await page.getByRole("button", { name: "Mis cursos", exact: true }).click()
  await page.getByRole("searchbox", { name: "Buscar cursos" }).fill("zzz")

  await expect(page.getByText('No encontramos "zzz" en Mis cursos.')).toBeVisible()
  await expect(cardOf(inProgressTitle)).toBeHidden()

  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click()
  await expect(page.getByRole("searchbox", { name: "Buscar cursos" })).toHaveValue("")
  await expect(page.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(cardOf(inProgressTitle)).toBeVisible()
})

test("a course with a completed block shows Continuar, which opens that lesson", async () => {
  const lessonUrl = `/learn/courses/${inProgressEnrollmentId}/lessons/${inProgress.modules[0]!.lessonId}`
  await page.goto(lessonUrl)
  await page.getByRole("button", { name: "Marcar como completado" }).click()
  await expect(page.getByRole("button", { name: "Completado", exact: true })).toBeVisible()

  // The toggle is optimistic: wait for the row the RPC rewrites before leaving the page.
  await expect
    .poll(async () => {
      const { data } = await supabaseAdmin
        .from("course_enrollments")
        .select("completed_blocks")
        .eq("id", inProgressEnrollmentId)
        .single()
      return data?.completed_blocks ?? null
    })
    .toBe(1)

  await page.goto("/learn")
  await cardOf(inProgressTitle).getByRole("button", { name: "Continuar", exact: true }).click()
  await page.waitForURL(new RegExp(`/learn/courses/${inProgressEnrollmentId}/lessons/${inProgress.modules[0]!.lessonId}$`))
})

test("the enrollment toast action opens the new course", async () => {
  await page.goto("/learn?vista=disponibles")
  await cardOf(freeCTitle).getByRole("button", { name: "Inscribirme", exact: true }).click()
  await expect(page.getByText(`Te inscribiste en ${freeCTitle}`)).toBeVisible()

  await page.getByRole("button", { name: "Empezar ahora", exact: true }).click()
  await page.waitForURL(/\/learn\/courses\/[0-9a-f-]{36}$/)
})

// Last on purpose: it leaves the screen, and the steps above run on /learn.
test("filters survive opening a course and coming back", async () => {
  await page.goto("/learn")
  await page.getByRole("button", { name: "Mis cursos", exact: true }).click()
  await page.waitForURL(/\/learn\?vista=mis-cursos$/)

  await cardOf(freeATitle).getByRole("button", { name: "Empezar", exact: true }).click()
  await page.waitForURL(/\/learn\/courses\//)

  await page.goBack()
  await page.waitForURL(/\/learn\?vista=mis-cursos$/)
  await expect(page.getByRole("button", { name: "Mis cursos", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(cardOf(freeATitle)).toBeVisible()
})
