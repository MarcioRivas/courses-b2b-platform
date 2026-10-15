import { test, expect, type Page } from "@playwright/test"
import { generateOtp } from "../helpers/otp"

async function loginViaOtp(page: Page, email: string) {
  await page.goto("/login")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByRole("button", { name: "Enviar código" }).click()
  await page.waitForURL(/\/login\/verify/)

  const otp = await generateOtp(email)
  await page.getByLabel("Código de verificación").fill(otp)
  await page.getByRole("button", { name: "Verificar" }).click()
}

test("org admin logs in via OTP, lands on /admin, and the session survives reload + navigation", async ({
  page,
}) => {
  await loginViaOtp(page, "admin@club-a.test")
  await page.waitForURL("/admin")
  await expect(page.getByText("Administrador")).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL("/admin")
  await expect(page.getByText("Administrador")).toBeVisible()

  await page.goto("/")
  await page.waitForURL("/admin")

  await page.goto("/admin")
  await expect(page).toHaveURL("/admin")
  await expect(page.getByText("Administrador")).toBeVisible()

  // The avatar menu must open without tripping the error boundary (base-ui
  // group-label context) and expose the account details + logout.
  await page.getByRole("button", { name: "Ana Admin" }).click()
  await expect(page.getByRole("menu")).toBeVisible()
  await expect(page.getByRole("menu").getByText("admin@club-a.test")).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Cerrar sesión" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Ocurrió un error inesperado. Intentá de nuevo." })).toBeHidden()
})

test("student logs in via OTP and lands on /learn", async ({ page }) => {
  await loginViaOtp(page, "alum1@club-a.test")
  await page.waitForURL("/learn")
  await expect(page.getByRole("heading", { name: "Cursos", exact: true })).toBeVisible()
})

test("student visiting an admin-only URL is redirected to /forbidden", async ({ page }) => {
  // Distinct seeded user from the previous test: two parallel workers requesting
  // an OTP for the same email would race and invalidate each other's code.
  await loginViaOtp(page, "alum2@club-a.test")
  await page.waitForURL("/learn")

  await page.goto("/admin")
  await page.waitForURL("/forbidden")
})
