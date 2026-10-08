import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp, expectRouteRenders } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_B = "22222222-2222-2222-2222-222222222222"
const ORG_B_NAME = "Federación Demo"

// Org B's admin. login.spec.ts drives the org A users; one seeded email per
// spec file keeps parallel workers from invalidating each other's OTP.
const ADMIN_EMAIL = "admin@fed-b.test"

const groupName = `Grupo E2E ${Date.now()}`

// Serial: one OTP login shared by every test in the file.
test.describe.configure({ mode: "serial" })

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await loginViaOtp(page, ADMIN_EMAIL, "/admin")
})

test.afterAll(async () => {
  // The group is created through the UI; remove it directly so a re-run starts
  // clean even if a test failed halfway (group_members cascades).
  await supabaseAdmin.from("groups").delete().eq("organization_id", ORG_B).eq("name", groupName)
  await page.close()
})

test("every org-admin screen renders without hitting the error boundary", async () => {
  await expectRouteRenders(page, "/admin", ORG_B_NAME)
  await expectRouteRenders(page, "/admin/members", "Miembros")
  await expectRouteRenders(page, "/admin/groups", "Grupos")
  await expectRouteRenders(page, "/admin/links", "Links de registro")
  await expectRouteRenders(page, "/admin/settings", "Configuración")
  await expectRouteRenders(page, "/admin/settings/score-scale", "Escala de puntajes")
  await expectRouteRenders(page, "/admin/analytics", "Estadísticas")
  await expectRouteRenders(page, "/admin/audit", "Registro de auditoría")
})

test("the dashboard counts the organization's seeded members and groups", async () => {
  await page.goto("/admin")

  // Seeded org B: 3 students, 1 professor. Phase 6 replaced the P2 cards with
  // `org_overview_stats`; assert the numbers, not just the labels.
  // Scoped to <main>: the side nav repeats some labels.
  const statCard = (label: string) =>
    page.getByRole("main").getByText(label, { exact: true }).locator("..")
  await expect(statCard("Estudiantes activos")).toContainText("3")
  await expect(statCard("Profesores activos")).toContainText("1")
  await expect(page.getByRole("main").getByText("Cursos publicados", { exact: true })).toBeVisible()
  await expect(page.getByRole("main").getByText("Pendientes de corregir", { exact: true })).toBeVisible()
})

test("the member directory lists this org's members only, with admin-only PII", async () => {
  await page.goto("/admin/members")

  const row = page.getByRole("row").filter({ hasText: "alum1@fed-b.test" })
  await expect(row).toBeVisible()
  await expect(row).toContainText("Estudiante")

  // Seeded org B has exactly 5 members (1 admin, 1 professor, 3 students);
  // the header row brings the table to 6. A broken RLS filter or a missing
  // organization_id predicate would pull in org A's members too.
  await expect(page.getByRole("row")).toHaveCount(6)

  // Cross-tenant proof at the UI layer: org A's people must not appear.
  await expect(page.getByText("alum1@club-a.test")).toHaveCount(0)
})

test("org admin creates a group, adds a student, and the list shows the new count", async () => {
  await page.goto("/admin/groups")

  await page.getByRole("button", { name: "Nuevo grupo" }).click()
  await page.getByLabel("Nombre").fill(groupName)
  await page.getByLabel("Descripción").fill("Creado por la prueba E2E")
  await page.getByRole("button", { name: "Guardar" }).click()

  // The row's only action is "Ver" (base-ui link-buttons render role=button).
  const newRow = page.getByRole("row").filter({ hasText: groupName })
  await expect(newRow).toBeVisible()

  await newRow.getByRole("button", { name: "Ver" }).click()
  await page.waitForURL(/\/admin\/groups\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible()
  await expect(page.getByText("Este grupo todavía no tiene miembros.")).toBeVisible()

  // Goes through the add_group_members RPC, never a direct insert (D24).
  await page.getByRole("checkbox").first().click()
  await page.getByRole("button", { name: /^Agregar/ }).click()
  await expect(page.getByText("Este grupo todavía no tiene miembros.")).toBeHidden()

  // DataList renders both the card and the table markup and hides one by
  // breakpoint, so assert against the table row rather than a bare text match.
  await page.goto("/admin/groups")
  const listRow = page.getByRole("row").filter({ hasText: groupName })
  await expect(listRow).toBeVisible()
  await expect(listRow).toContainText("1 miembro")

  // Deleting lives on the group page, next to "Editar", and returns to the list.
  await listRow.getByRole("button", { name: "Ver" }).click()
  await page.getByRole("button", { name: "Eliminar", exact: true }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click()
  await page.waitForURL(/\/admin\/groups$/)
  await expect(page.getByRole("row").filter({ hasText: groupName })).toHaveCount(0)
})

test("audit log shows filters and the group creation event just performed", async () => {
  await page.goto("/admin/audit")

  await expect(page.getByRole("heading", { name: "Registro de auditoría" })).toBeVisible()
  await expect(page.getByPlaceholder("Buscar por usuario…")).toBeVisible()

  // The group created two tests ago went through `logAudit` (D28) — it must
  // show up here, scoped to org B, with an expandable metadata detail.
  await expect(page.getByText("Grupo creado").first()).toBeVisible()
})

test("analytics page displays all four sections for org admin (Phase 6)", async () => {
  await page.goto("/admin/analytics")

  // Page header
  await expect(page.getByRole("heading", { name: "Estadísticas", level: 1 })).toBeVisible()
  await expect(page.getByText("Números clave de tu organización.")).toBeVisible()

  // Four main sections
  await expect(page.getByRole("heading", { name: "Estudiantes", level: 2 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Cursos", level: 2 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Profesores", level: 2 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Evaluaciones", level: 2 })).toBeVisible()
})

test("admin dashboard still displays count cards", async () => {
  await page.goto("/admin")

  // The four stat cards from Phase 6
  const statCard = (label: string) =>
    page.getByRole("main").getByText(label, { exact: true }).locator("..")
  await expect(statCard("Estudiantes activos")).toBeVisible()
  await expect(statCard("Profesores activos")).toBeVisible()
  await expect(statCard("Cursos publicados")).toBeVisible()
  await expect(statCard("Pendientes de corregir")).toBeVisible()
})

test("a professor cannot reach the admin screens", async ({ page: professorPage }) => {
  await loginViaOtp(professorPage, "prof@fed-b.test", "/teach")

  await professorPage.goto("/admin/groups")
  await professorPage.waitForURL("/forbidden")

  await professorPage.goto("/admin/members")
  await professorPage.waitForURL("/forbidden")
})
