import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { landingMessages } from "../../src/lib/messages/landing"

test("anonymous visitor sees the landing page and the header CTA leads to /login", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  // "Iniciar sesión" appears in header, hero and footer — scope to the banner.
  const headerLogin = page.getByRole("banner").getByRole("link", { name: "Iniciar sesión" })
  await expect(headerLogin).toBeVisible()
  await headerLogin.click()
  await page.waitForURL("/login")
  await expect(page.getByLabel("Correo electrónico")).toBeVisible()
})

test("secondary CTA scrolls to the features section", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("link", { name: landingMessages.hero.ctaSecondary }).click()
  await expect(page.getByRole("heading", { name: landingMessages.features.title })).toBeInViewport()
})

test("landing has no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})

test("logged-in student visiting / is redirected to /learn", async ({ page }) => {
  // Distinct seeded email from other specs: parallel OTP requests for the same
  // address invalidate each other's code.
  await loginViaOtp(page, "alum2@fed-b.test", "/learn")
  await page.goto("/")
  await page.waitForURL("/learn")
  await expect(page.getByRole("heading", { name: "Mis cursos" })).toBeVisible()
})
