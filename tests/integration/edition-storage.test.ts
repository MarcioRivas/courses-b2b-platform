import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, cleanupFixtures } from "../helpers/course-fixtures"
import { deleteGroups, makeTwoEditionCourse, type TwoEditionCourse } from "../helpers/edition-fixtures"
import { buildCourseFilePath, COURSE_FILES_BUCKET } from "@/lib/storage/file-path"

/**
 * B2 storage: new uploads live under `<org>/<course>/<edition>/…` and are
 * writable only by an editor of THAT edition; legacy `<org>/<course>/<file>`
 * objects are writable by org admins only.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const PDF_BYTES = Buffer.from("%PDF-1.4 edition storage test")

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const uploaded: string[] = []
const member = createMemberFactory(cleanup)

let course: TwoEditionCourse
let profA: Awaited<ReturnType<typeof member>>
let profB: Awaited<ReturnType<typeof member>>
let admin: Awaited<ReturnType<typeof member>>

function pathFor(offeringId: string, name: string): string {
  return buildCourseFilePath({ organizationId: ORG_A, courseId: course.courseId, offeringId, fileName: name })
}

async function upload(client: typeof profA.client, path: string) {
  return client.storage.from(COURSE_FILES_BUCKET).upload(path, PDF_BYTES, { contentType: "application/pdf" })
}

async function exists(path: string): Promise<boolean> {
  const folder = path.split("/").slice(0, -1).join("/")
  const { data } = await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).list(folder)
  return (data ?? []).some((f) => f.name === path.split("/").pop())
}

beforeAll(async () => {
  profA = await member("es-prof-a", ORG_A, "PROFESSOR")
  profB = await member("es-prof-b", ORG_A, "PROFESSOR")
  admin = await member("es-admin", ORG_A, "ADMIN")
  course = await makeTwoEditionCourse(ORG_A, "Curso storage por edición")
  courseIds.push(course.courseId)
  groupIds.push(course.groupId)
  await assignOfferingProfessor(course.a.offeringId, profA.id)
  await assignOfferingProfessor(course.b.offeringId, profB.id)
}, 60_000)

afterAll(async () => {
  if (uploaded.length > 0) await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).remove(uploaded)
  await cleanupFixtures({ users: cleanup, courseIds })
  await deleteGroups(groupIds)
})

describe("edition-prefixed uploads", () => {
  // Note: `authenticated` has no SELECT on storage.objects by design (D26), so a
  // user-session remove() never matches a row; deletes are proven by "the object
  // is still there", writes by the upload result.
  it("a professor writes under their own edition's prefix", async () => {
    const path = pathFor(course.a.offeringId, "own.pdf")
    uploaded.push(path)
    expect((await upload(profA.client, path)).error).toBeNull()
    expect(await exists(path)).toBe(true)
  })

  it("a professor of edition A cannot write under edition B's prefix, nor delete from it", async () => {
    const hack = pathFor(course.b.offeringId, "hack.pdf")
    expect((await upload(profA.client, hack)).error).not.toBeNull()

    const seeded = pathFor(course.b.offeringId, "seeded.pdf")
    uploaded.push(seeded)
    await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).upload(seeded, PDF_BYTES, { contentType: "application/pdf" })
    await profA.client.storage.from(COURSE_FILES_BUCKET).remove([seeded])
    expect(await exists(seeded)).toBe(true)

    // Positive control: edition B's own professor may write to the same prefix.
    const ownB = pathFor(course.b.offeringId, "own-b.pdf")
    uploaded.push(ownB)
    expect((await upload(profB.client, ownB)).error).toBeNull()
  })

  it("an org admin may write under any edition of their organization", async () => {
    const path = pathFor(course.b.offeringId, "admin.pdf")
    uploaded.push(path)
    expect((await upload(admin.client, path)).error).toBeNull()
  })

  it("an edition id that belongs to another course is refused even for an editor of that edition", async () => {
    const path = `${ORG_A}/${crypto.randomUUID()}/${course.a.offeringId}/mismatch.pdf`
    expect((await upload(profA.client, path)).error).not.toBeNull()
  })
})

describe("legacy course-level prefix is admin-only", () => {
  it("a professor of the course cannot write or delete a legacy object, an admin can write", async () => {
    const legacy = `${ORG_A}/${course.courseId}/${crypto.randomUUID()}-legacy.pdf`
    uploaded.push(legacy)

    expect((await upload(profA.client, legacy)).error).not.toBeNull()
    expect((await upload(admin.client, legacy)).error).toBeNull()

    await profA.client.storage.from(COURSE_FILES_BUCKET).remove([legacy])
    expect(await exists(legacy)).toBe(true)
  })

  it("can_write_offering_file denies malformed paths", async () => {
    const check = async (name: string) =>
      (await profA.client.rpc("can_write_offering_file", { p_name: name })).data
    expect(await check("not-a-path.pdf")).toBe(false)
    expect(await check(`${ORG_A}/not-a-uuid/${course.a.offeringId}/x.pdf`)).toBe(false)
    expect(await check(`${ORG_A}/${course.courseId}/not-a-uuid/x.pdf`)).toBe(false)
    expect(await check(`${ORG_A}/${course.courseId}/${course.a.offeringId}/x.pdf`)).toBe(true)
    expect(await check(`${ORG_A}/${course.courseId}/${course.b.offeringId}/x.pdf`)).toBe(false)
  })
})
