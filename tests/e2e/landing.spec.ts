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

test("the hero headline is fully shown right after load", async ({ page }) => {
  await page.goto("/")
  const headline = page.getByRole("heading", { level: 1 })
  // toBeVisible() accepts opacity 0, so read the computed opacity of the entrance.
  await expect.poll(() => headline.evaluate((element) => getComputedStyle(element).opacity), { timeout: 1500 }).toBe("1")
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
  await expect(page.getByRole("heading", { name: "Cursos", exact: true })).toBeVisible()
})

test("new sections render and the final CTA leads to /login", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: landingMessages.experience.title })).toBeVisible()
  const finalHeading = page.getByRole("heading", { name: landingMessages.finalCta.title })
  await finalHeading.scrollIntoViewIfNeeded()
  await expect(finalHeading).toBeVisible()

  await page.getByRole("link", { name: landingMessages.finalCta.action }).last().click()
  await page.waitForURL("/login")
  await expect(page.getByLabel("Correo electrónico")).toBeVisible()
})

test("with reduced motion everything shows its final state immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")

  // Scroll-driven reveals are off: every group is fully opaque, even off-screen.
  const opacities = await page
    .locator(".reveal-on-scroll")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity))
  expect(opacities.length).toBeGreaterThanOrEqual(4)
  expect(opacities.every((opacity) => opacity === "1")).toBe(true)

  // The lesson preview shows its completed state without scrolling through it.
  await expect(page.getByText(landingMessages.experience.mock.completedTitle)).toBeVisible()
  const firstCheckOpacity = await page
    .locator(".lesson-preview [data-step]")
    .first()
    .evaluate((element) => getComputedStyle(element).opacity)
  expect(firstCheckOpacity).toBe("1")
})

test("mobile keeps the header CTA and hides the section anchors", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const banner = page.getByRole("banner")
  await expect(banner.getByRole("link", { name: "Iniciar sesión" })).toBeVisible()
  await expect(banner.getByRole("navigation")).toBeHidden()
  await expect(page.getByRole("link", { name: landingMessages.hero.ctaPrimary }).first()).toBeInViewport()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
