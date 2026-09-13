import { test, expect } from "@playwright/test"
import { generateOtp } from "../helpers/otp"
import { deleteUserByEmail } from "../helpers/make-user"

/**
 * Registers into **org A** on purpose: `admin-screens.spec.ts` asserts org B's
 * seeded member counts, and a throwaway student sitting in that org while both
 * files run in parallel makes those counts race. Nothing asserts org A's
 * member totals.
 */
const createdEmails: string[] = []

test.afterAll(async () => {
  await Promise.all(createdEmails.map((email) => deleteUserByEmail(email)))
})

function e2eEmail(label: string): string {
  const email = `test+e2e-${label}-${Date.now()}@enecourses.test`
  createdEmails.push(email)
  return email
}

test("a fresh email registers via the org A link and lands on /learn", async ({ page }) => {
  const email = e2eEmail("register")

  await page.goto("/register/demo-link-org-a")
  await expect(page.getByRole("heading", { name: "Completar registro" })).toBeVisible()

  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByRole("button", { name: "Enviar código" }).click()
  await page.waitForURL(/\/login\/verify/)

  const otp = await generateOtp(email)
  await page.getByLabel("Código de verificación").fill(otp)
  await page.getByRole("button", { name: "Verificar" }).click()

  await page.waitForURL(/\/register\/demo-link-org-a\/complete/)
  await page.getByLabel("Nombre").fill("Test")
  await page.getByLabel("Apellido").fill("E2E")
  await page.getByLabel("Teléfono").fill("099123456")
  await page.getByLabel("DNI").fill("12345678")
  await page.getByRole("button", { name: "Finalizar registro" }).click()

  await page.waitForURL("/learn")
})

test("an invalid registration token shows an error message", async ({ page }) => {
  await page.goto("/register/invalid-token-xyz")
  await expect(page.getByRole("heading", { name: "Link no válido" })).toBeVisible()
})

test("verifying an OTP without completing registration lands on /register-required, not a login loop (W1)", async ({
  page,
}) => {
  const email = e2eEmail("abandoned")

  await page.goto("/register/demo-link-org-a")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByRole("button", { name: "Enviar código" }).click()
  await page.waitForURL(/\/login\/verify/)

  const otp = await generateOtp(email)
  await page.getByLabel("Código de verificación").fill(otp)
  await page.getByRole("button", { name: "Verificar" }).click()

  // Register-mode verification always lands on the profile form — the account
  // now exists (shouldCreateUser: true) but has no `profiles` row yet.
  await page.waitForURL(/\/register\/demo-link-org-a\/complete/)

  // Abandon the flow here and go straight to a guarded route: must resolve
  // to /register-required, never bounce back to /login (session is valid).
  await page.goto("/learn")
  await page.waitForURL("/register-required")
})
