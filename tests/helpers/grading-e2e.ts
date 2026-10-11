import { expect, type Page } from "@playwright/test"

/**
 * The grading panel's single "Guardar": opens the preview, reads the percent
 * and label it shows, confirms, then asserts the toast and the post-save
 * summary show exactly those values. The preview is computed on the client and
 * the save result on the server, so this catches any drift between the two.
 */
export async function previewAndConfirmGrade(page: Page): Promise<{ percent: string; label: string }> {
  await page.getByRole("button", { name: "Guardar", exact: true }).click()

  const dialog = page.getByRole("dialog", { name: "Revisá la nota antes de guardar" })
  await expect(dialog).toBeVisible()
  const percent = ((await dialog.getByTestId("grade-preview-percent").textContent()) ?? "").trim()
  const label = ((await dialog.getByTestId("grade-preview-label").textContent()) ?? "").trim()
  expect(percent).toMatch(/^\d+(\.\d+)?%$/)

  await dialog.getByRole("button", { name: "Confirmar y guardar" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Corrección guardada: ${percent} (${label}).`)).toBeVisible()
  await expect(page.locator("dl dd").filter({ hasText: "%" }).first()).toHaveText(`${percent} (${label})`)

  return { percent, label }
}
