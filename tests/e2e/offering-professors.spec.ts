import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { makeUser } from "../helpers/make-user"
import { makeCourseFixture, cleanupFixtures } from "../helpers/course-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.setTimeout(120_000)

test("admin assigns and removes a professor on an edition, with breadcrumb and group on the detail", async ({ page }) => {
  const stamp = Date.now()
  const tag = `Zeta${String(stamp).slice(-6)}`
  const admin = await makeUser(`e2e-op-admin-${stamp}`, { organizationId: ORG_A, role: "ADMIN" })
  const professor = await makeUser(`e2e-op-prof-${stamp}`, {
    organizationId: ORG_A,
    role: "PROFESSOR",
    firstName: tag,
    lastName: "Docente",
  })
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso edición profesores ${stamp}`,
    modules: [{ title: "Módulo 1", requiredBlocks: 1 }],
  })

  try {
    await loginViaOtp(page, admin.email, "/admin")

    // Editions list: the "Profesores" column starts at 0.
    await page.goto(`/admin/courses/${course.courseId}/offerings`)
    await expect(page.getByRole("columnheader", { name: "Profesores" })).toBeVisible()

    await page.goto(`/admin/courses/${course.courseId}/offerings/${course.offeringId}`)
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" }).getByText("Ediciones")).toBeVisible()
    await expect(page.getByText("Grupo asignado")).toBeVisible()

    await page.getByRole("link", { name: "Profesores", exact: true }).click()
    await page.waitForURL(/\/professors$/)
    await expect(page.getByText("Esta edición todavía no tiene profesores asignados.")).toBeVisible()

    await page.getByLabel("Buscar profesor por nombre o email").fill(tag)
    const result = page.getByRole("listitem").filter({ hasText: `${tag} Docente` })
    await expect(result).toBeVisible()
    await result.getByRole("button", { name: "Asignar" }).click()

    const assigned = page.getByRole("listitem").filter({ hasText: `${tag} Docente` }).filter({ has: page.getByRole("button", { name: "Quitar" }) })
    await expect(assigned).toBeVisible()

    await assigned.getByRole("button", { name: "Quitar" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click()
    await expect(page.getByText("Esta edición todavía no tiene profesores asignados.")).toBeVisible()
  } finally {
    await cleanupFixtures({ users: [admin.id, professor.id], courseIds: [course.courseId] })
  }
})
