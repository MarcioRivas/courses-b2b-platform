import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp, expectRouteRenders } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { deleteUser, makeUser } from "../helpers/make-user"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const GROUP_A = "11111111-1111-1111-1111-111111111112"

// A throwaway admin created for this file only. The seeded org A admin is
// already driven by login.spec.ts, and two workers requesting an OTP for the
// same address invalidate each other's code.
const courseTitle = `Curso E2E ${Date.now()}`
const moduleTitle = "Módulo de prueba"
const lessonTitle = "Lección de prueba"

test.describe.configure({ mode: "serial" })

let page: Page
let adminUserId: string

test.beforeAll(async ({ browser }) => {
  // A throwaway admin: the seeded org A admin is already driven by
  // login.spec.ts, and two parallel workers requesting an OTP for the same
  // address invalidate each other's code.
  const admin = await makeUser("e2e-course-admin", { organizationId: ORG_A, role: "ADMIN" })
  adminUserId = admin.id

  page = await browser.newPage()
  await loginViaOtp(page, admin.email, "/admin")
})

test.afterAll(async () => {
  // Cascades to modules, lessons, blocks, offerings and enrollments.
  await supabaseAdmin.from("courses").delete().eq("organization_id", ORG_A).eq("title", courseTitle)
  if (adminUserId) await deleteUser(adminUserId)
  await page.close()
})

test("every course screen renders without hitting the error boundary", async () => {
  await expectRouteRenders(page, "/admin/courses", "Cursos")
  await expectRouteRenders(page, "/admin/courses/new", "Nuevo curso")
})

test("admin creates a course, and it starts as a draft", async () => {
  await page.goto("/admin/courses/new")

  await page.getByLabel("Título").fill(courseTitle)
  await page.getByLabel("Descripción").fill("Creado por la prueba E2E")
  await page.getByRole("button", { name: "Crear" }).first().click()

  await page.goto("/admin/courses")
  const row = page.getByRole("row").filter({ hasText: courseTitle })
  await expect(row).toBeVisible()
  await expect(row).toContainText("Borrador")
})

test("publishing is refused while the course has no content", async () => {
  const courseId = await courseIdByTitle(courseTitle)
  await page.goto(`/admin/courses/${courseId}`)

  await page.getByRole("button", { name: "Publicar" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Publicar curso" })
  await dialog.getByRole("button", { name: "Publicar" }).click()

  // The RPC raises COURSE_INCOMPLETE; the dialog must explain what is missing
  // rather than surfacing a database error.
  await expect(page.getByText("El curso todavía no se puede publicar")).toBeVisible()
  await expect(page.getByText("Al menos un módulo")).toBeVisible()

  // And the course is still a draft afterwards.
  const { data } = await supabaseAdmin.from("courses").select("status").eq("id", courseId).single()
  expect(data?.status).toBe("DRAFT")
})

test("admin builds module, lesson and a content block, then publishes", async () => {
  const courseId = await courseIdByTitle(courseTitle)
  await page.goto(`/admin/courses/${courseId}/content`)

  await page.getByRole("button", { name: "Nuevo módulo" }).click()
  await page.getByLabel("Título").fill(moduleTitle)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Módulo guardado.")).toBeVisible()
  await expect(page.getByText(moduleTitle).first()).toBeVisible()

  await page.getByRole("button", { name: "Nueva lección" }).click()
  await page.getByLabel("Título").fill(lessonTitle)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Lección guardada.")).toBeVisible()
  await expect(page.getByText(lessonTitle).first()).toBeVisible()

  await page.getByRole("button", { name: "Agregar contenido" }).click()
  await page.getByRole("button", { name: "Texto", exact: true }).click()
  await page.getByLabel("Contenido").fill("Hola mundo")
  await page.getByRole("button", { name: "Guardar" }).click()

  // Wait for the save to land before reading the database: a Server Action
  // compiled on demand can outlive the assertion, and this file's cleanup
  // would then delete the course out from under a still-running action.
  await expect(page.getByText("Contenido guardado.")).toBeVisible()

  // The structure really landed, not just the optimistic UI. Resolved step by
  // step rather than through a nested embed filter, so a failure points at the
  // missing row rather than at a mis-typed PostgREST path.
  const { data: modules } = await supabaseAdmin.from("modules").select("id").eq("course_id", courseId)
  expect(modules ?? []).toHaveLength(1)

  const { data: lessons } = await supabaseAdmin
    .from("lessons")
    .select("id")
    .eq("module_id", modules![0]!.id)
  expect(lessons ?? []).toHaveLength(1)

  const { data: blocks } = await supabaseAdmin
    .from("lesson_content_blocks")
    .select("type, data")
    .eq("lesson_id", lessons![0]!.id)
  expect(blocks ?? []).toHaveLength(1)
  expect(blocks![0]!.type).toBe("RICH_TEXT")

  await page.goto(`/admin/courses/${courseId}`)
  await page.getByRole("button", { name: "Publicar" }).first().click()
  await page
    .getByRole("dialog", { name: "Publicar curso" })
    .getByRole("button", { name: "Publicar" })
    .click()

  await expect
    .poll(async () => {
      const { data } = await supabaseAdmin.from("courses").select("status").eq("id", courseId).single()
      return data?.status
    })
    .toBe("PUBLISHED")
})

test("an offering for a group enrolls that group's students", async () => {
  const courseId = await courseIdByTitle(courseTitle)

  // The offering form is admin-only and derives kind from the course access
  // type; PRIVATE is the default, so this is a GROUP offering.
  // The offerings page is headed by the course title; "Ofertas" is the section.
  await page.goto(`/admin/courses/${courseId}/offerings`)
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()

  const { data: offering, error } = await supabaseAdmin
    .from("course_offerings")
    .insert({
      course_id: courseId,
      organization_id: ORG_A,
      kind: "GROUP",
      group_id: GROUP_A,
      name: "Oferta E2E",
    })
    .select("id")
    .single()
  expect(error).toBeNull()

  await page.goto(`/admin/courses/${courseId}/offerings/${offering!.id}`)
  await page.getByRole("button", { name: "Sincronizar inscripciones" }).click()

  // Group A holds the three seeded students.
  await expect
    .poll(async () => {
      const { count } = await supabaseAdmin
        .from("course_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("offering_id", offering!.id)
        .eq("status", "ACTIVE")
      return count
    })
    .toBe(3)
})

test("a professor cannot reach the admin course screens", async ({ page: professorPage }) => {
  await loginViaOtp(professorPage, "prof@club-a.test", "/teach")

  await professorPage.goto("/admin/courses")
  await professorPage.waitForURL("/forbidden")

  // But their own course list is reachable.
  await professorPage.goto("/teach/courses")
  await expect(professorPage.getByRole("heading", { name: "Cursos" })).toBeVisible()

  // Phase 6: the professor overview renders its analytics summary.
  await professorPage.goto("/teach")
  await expect(professorPage.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(professorPage.getByText("Resumen de tus cursos asignados.")).toBeVisible()
})

async function courseIdByTitle(title: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("id")
    .eq("organization_id", ORG_A)
    .eq("title", title)
    .single()
  if (error || !data) throw error ?? new Error(`course "${title}" not found`)
  return data.id
}
