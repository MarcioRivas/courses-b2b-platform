import { test, expect } from "@playwright/test"
import { loginViaOtp } from "../helpers/e2e-login"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeUser } from "../helpers/make-user"
import { cleanupFixtures, makeCourseFixture } from "../helpers/course-fixtures"
import { deleteGroups } from "../helpers/edition-fixtures"

const ORG_A = "11111111-1111-1111-1111-111111111111"

test.setTimeout(180_000)

test("admin creates 'Edición 2' copying 'Edición 1', assigns a professor; the professor and a student only see edition 2", async ({ browser }) => {
  const stamp = Date.now()
  const tag = `Omega${String(stamp).slice(-6)}`
  const admin = await makeUser(`e2e-ce-admin-${stamp}`, { organizationId: ORG_A, role: "ADMIN" })
  const professor = await makeUser(`e2e-ce-prof-${stamp}`, { organizationId: ORG_A, role: "PROFESSOR", firstName: tag, lastName: "Docente" })
  const student = await makeUser(`e2e-ce-student-${stamp}`, { organizationId: ORG_A, role: "STUDENT" })
  const title = `Curso crear edición ${stamp}`
  const course = await makeCourseFixture({ organizationId: ORG_A, title, modules: [{ title: "Módulo original", requiredBlocks: 1 }] })
  await supabaseAdmin.from("course_offerings").update({ name: "Edición 1" }).eq("id", course.offeringId)

  const { data: group } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: ORG_A, name: `Grupo edición 2 ${stamp}` })
    .select("id")
    .single()
  await supabaseAdmin.from("group_members").insert({ group_id: group!.id, user_id: student.id })

  const adminPage = await (await browser.newContext()).newPage()
  const professorPage = await (await browser.newContext()).newPage()
  const studentPage = await (await browser.newContext()).newPage()

  try {
    await loginViaOtp(adminPage, admin.email, "/admin")
    await adminPage.goto(`/admin/courses/${course.courseId}/offerings`)
    await adminPage.getByRole("button", { name: "Nueva edición" }).click()

    const dialog = adminPage.getByRole("dialog")
    await dialog.getByLabel("Nombre").fill("Edición 2")
    await dialog.getByRole("combobox").first().click()
    await adminPage.getByRole("option", { name: `Grupo edición 2 ${stamp}` }).click()
    await dialog.getByLabel("Copiar de otra edición").check()
    await dialog.getByRole("combobox").nth(1).click()
    await adminPage.getByRole("option", { name: "Edición 1" }).click()
    await dialog.getByRole("button", { name: "Guardar" }).click()

    await adminPage.waitForURL(/\/offerings\/[0-9a-f-]{36}\?copied=1$/)
    await expect(adminPage.getByText("Las evaluaciones copiadas quedaron en borrador: revisá fechas y publicalas.")).toBeVisible()
    const edition2Id = adminPage.url().match(/offerings\/([0-9a-f-]{36})/)![1]!

    // Edition 2 owns its own (copied) modules; renaming one proves the student reads edition 2's tree.
    await supabaseAdmin.from("modules").update({ title: "Módulo solo de edición 2" }).eq("offering_id", edition2Id)

    await adminPage.getByRole("link", { name: "Profesores", exact: true }).click()
    await adminPage.waitForURL(/\/professors$/)
    await adminPage.getByLabel("Buscar profesor por nombre o email").fill(tag)
    const result = adminPage.getByRole("listitem").filter({ hasText: `${tag} Docente` })
    await result.getByRole("button", { name: "Asignar" }).click()
    await expect(
      adminPage.getByRole("listitem").filter({ hasText: `${tag} Docente` }).filter({ has: adminPage.getByRole("button", { name: "Quitar" }) })
    ).toBeVisible()

    // Professor: /teach lists the course, and only edition 2 is visible to them.
    await loginViaOtp(professorPage, professor.email, "/teach")
    await expect(professorPage.getByRole("cell", { name: title })).toBeVisible()
    const visible = await professor.client.from("course_offerings").select("id").eq("course_id", course.courseId)
    expect(visible.data?.map((o) => o.id)).toEqual([edition2Id])

    // Student of edition 2 (enrolled through the new group) sees edition 2's content.
    const enrollment = await supabaseAdmin
      .from("course_enrollments")
      .select("id")
      .eq("offering_id", edition2Id)
      .eq("user_id", student.id)
      .single()
    expect(enrollment.data?.id).toBeTruthy()
    await loginViaOtp(studentPage, student.email, "/learn")
    await studentPage.goto(`/learn/courses/${enrollment.data!.id}`)
    await expect(studentPage.getByText("Módulo solo de edición 2", { exact: true })).toBeVisible()
    await expect(studentPage.getByText("Módulo original", { exact: true })).toBeHidden()
  } finally {
    await cleanupFixtures({ users: [admin.id, professor.id, student.id], courseIds: [course.courseId] })
    await deleteGroups(group ? [group.id] : [])
  }
})
