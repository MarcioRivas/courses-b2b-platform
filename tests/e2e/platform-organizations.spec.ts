import { test, expect, type Page } from "@playwright/test"
import { loginViaOtp, expectRouteRenders } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"

// The only seeded platform admin; no other spec file logs in as this address.
const SUPER_ADMIN_EMAIL = "super@enecourses.test"

const orgSlug = `club-e2e-${Date.now()}`
const orgName = `Club E2E ${Date.now()}`

// Serial: one OTP login shared by every test in the file.
test.describe.configure({ mode: "serial" })

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await loginViaOtp(page, SUPER_ADMIN_EMAIL, "/platform")
})

test.afterAll(async () => {
  // Created through the UI; settings, score ranges and links cascade.
  await supabaseAdmin.from("organizations").delete().eq("slug", orgSlug)
  await page.close()
})

test("every platform screen renders without hitting the error boundary", async () => {
  await expectRouteRenders(page, "/platform", "Plataforma")
  await expectRouteRenders(page, "/platform/organizations", "Organizaciones")
  await expectRouteRenders(page, "/platform/organizations/new", "Nueva organización")
  await expectRouteRenders(page, "/platform/audit", "Registro de auditoría")
})

test("platform admin creates an organization and gets the one-time ADMIN link (D23)", async () => {
  await page.goto("/platform/organizations/new")

  await page.getByLabel("Nombre").fill(orgName)
  await page.getByLabel("Slug").fill(orgSlug)
  await page.getByRole("button", { name: "Crear organización" }).click()

  await expect(page.getByRole("heading", { name: "Organización creada" })).toBeVisible()

  // The registration URL is shown once and must be a usable /register/<token>.
  const linkText = await page.locator("code").first().innerText()
  expect(linkText).toContain("/register/")

  // Bootstrap really happened: settings + the 4 default score ranges (§33).
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .single()
  expect(org?.name).toBe(orgName)

  const { count: rangeCount } = await supabaseAdmin
    .from("score_scale_ranges")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org!.id)
  expect(rangeCount).toBe(4)
})

test("the organization detail tabs render members and links for any org", async () => {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single()

  await page.goto(`/platform/organizations/${org!.id}`)
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible()

  await page.getByRole("link", { name: "Miembros" }).click()
  await expect(page.getByText("No hay miembros", { exact: true })).toBeVisible()

  // Tabs are URL state now, so a reload must keep the active tab.
  await page.reload()
  await expect(page.getByText("No hay miembros", { exact: true })).toBeVisible()

  // The bootstrap ADMIN link is listed for the org the platform admin picked.
  await page.getByRole("link", { name: "Links", exact: true }).click()
  await expect(page.getByRole("row").filter({ hasText: "Administrador inicial" })).toBeVisible()
})

test("platform page displays per-org rollup table with seeded organizations (Phase 6)", async () => {
  await page.goto("/platform")

  // Page header
  await expect(page.getByRole("heading", { name: "Panel de super administrador", level: 1 })).toBeVisible()

  // Per-org rollup table section
  await expect(page.getByRole("heading", { name: "Por organización", level: 2 })).toBeVisible()

  // The seeded orgs (at least Club A should be visible as per seed data)
  const table = page.getByRole("table")
  await expect(table).toBeVisible()
  // Table header row has "Organización" column
  await expect(page.getByRole("columnheader", { name: "Organización" })).toBeVisible()
})

test("a non-platform-admin cannot reach the platform screens", async ({ page: memberPage }) => {
  // alum3 is claimed by no other spec file, so its OTP cannot be raced.
  await loginViaOtp(memberPage, "alum3@club-a.test", "/learn")

  await memberPage.goto("/platform/organizations")
  await memberPage.waitForURL("/forbidden")
})
