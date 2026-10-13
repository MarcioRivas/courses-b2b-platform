import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { makeUser } from "../helpers/make-user"
import { cleanupFixtures } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const users: string[] = []

test.afterAll(async () => {
  await cleanupFixtures({ users, courseIds: [] })
})

test("mobile: the menu drops down under the header and closes on navigation", async ({ page }) => {
  const professor = await makeUser(`e2e-nav-mobile-${Date.now()}`, { organizationId: ORG_A, role: "PROFESSOR" })
  users.push(professor.id)
  await page.setViewportSize({ width: 390, height: 844 })
  await loginViaOtp(page, professor.email, "/teach")

  await expect(page.getByRole("complementary")).toBeHidden()
  await page.getByRole("button", { name: "Abrir menú" }).click()
  const menu = page.locator("#mobile-nav-menu")
  await expect(menu).toBeVisible()
  // Right under the header, full width (polled: the panel slides in).
  const header = (await page.locator("header").boundingBox())!
  await expect.poll(async () => Math.round((await menu.boundingBox())!.y)).toBe(Math.round(header.y + header.height))
  expect((await menu.boundingBox())!.width).toBeCloseTo(390, 0)

  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()

  await page.getByRole("button", { name: "Abrir menú" }).click()
  await menu.getByRole("link", { name: "Correcciones" }).click()
  await page.waitForURL("**/teach/grading")
  await expect(menu).toBeHidden()
})

test("desktop: the sidebar collapses to icons with names on hover, and remembers it", async ({ page }) => {
  const professor = await makeUser(`e2e-nav-desktop-${Date.now()}`, { organizationId: ORG_A, role: "PROFESSOR" })
  users.push(professor.id)
  await page.setViewportSize({ width: 1280, height: 800 })
  await loginViaOtp(page, professor.email, "/teach")

  const sidebar = page.getByRole("complementary")
  await expect(sidebar.getByText("Correcciones")).toBeVisible()

  await sidebar.getByRole("button", { name: "Contraer menú" }).click()
  await expect(sidebar.getByText("Correcciones")).toBeHidden()
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(80)

  await sidebar.getByRole("link", { name: "Correcciones" }).hover()
  await expect(page.getByText("Correcciones")).toBeVisible()

  // The state survives a reload (cookie read on the server).
  await page.reload()
  await expect(sidebar.getByRole("button", { name: "Expandir menú" })).toBeVisible()
  await sidebar.getByRole("button", { name: "Expandir menú" }).click()
  await expect(sidebar.getByText("Correcciones")).toBeVisible()
})
