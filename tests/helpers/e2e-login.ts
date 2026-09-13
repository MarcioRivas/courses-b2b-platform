import { expect, type Page } from "@playwright/test"
import { generateOtp } from "./otp"

/**
 * Drives the real OTP login flow in the browser and waits for the role home.
 * Two workers requesting an OTP for the same address would invalidate each
 * other's code, so every spec file must use a distinct seeded email.
 */
export async function loginViaOtp(page: Page, email: string, expectedPath: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByRole("button", { name: "Enviar código" }).click()
  await page.waitForURL(/\/login\/verify/)

  const otp = await generateOtp(email)
  await page.getByLabel("Código de verificación").fill(otp)
  await page.getByRole("button", { name: "Verificar" }).click()
  await page.waitForURL(expectedPath)
}

/**
 * Visits a route and fails if the app's error boundary rendered. Catches
 * server-side render crashes that integration tests cannot see — for example a
 * Server Component handing a Client Component a non-serializable prop.
 */
export async function expectRouteRenders(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole("heading", { name: "Ocurrió un error inesperado. Intentá de nuevo." })).toBeHidden()
  await expect(page.getByRole("heading", { name: heading })).toBeVisible()
}
