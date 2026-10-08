import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, ensureOffering } from "../helpers/course-fixtures"
import { buildCourseFilePath, COURSE_FILES_BUCKET } from "@/lib/storage/file-path"

/**
 * D10/D26: nobody reads a `course-files` object with their own session, not
 * even an enrolled student of the same org — every read is a signed URL
 * minted server-side after `can_view_block`. Writes are scoped to
 * `can_edit_offering(folder[3])`, so a professor of one course cannot touch
 * another course's prefix even inside the same organization.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const PDF_BYTES = Buffer.from("%PDF-1.4 test file")

const cleanup: string[] = []
const member = createMemberFactory(cleanup)
const courseIds: string[] = []
const uploadedPaths: string[] = []

let professorX: Awaited<ReturnType<typeof member>>
let professorY: Awaited<ReturnType<typeof member>>
let studentA: Awaited<ReturnType<typeof member>>
let courseXId: string
let courseYId: string
let offeringXId: string
let offeringYId: string
let seededPath: string

beforeAll(async () => {
  professorX = await member("storage-prof-x", ORG_A, "PROFESSOR")
  professorY = await member("storage-prof-y", ORG_A, "PROFESSOR")
  studentA = await member("storage-student-a", ORG_A, "STUDENT")

  const { data: courses, error: courseError } = await supabaseAdmin
    .from("courses")
    .insert([
      { organization_id: ORG_A, title: `Curso X ${Date.now()}`, status: "PUBLISHED", access_type: "PRIVATE" },
      { organization_id: ORG_A, title: `Curso Y ${Date.now()}`, status: "PUBLISHED", access_type: "PRIVATE" },
    ])
    .select("id, title")
  if (courseError || !courses) throw courseError ?? new Error("courses not created")

  courseXId = courses.find((c) => c.title.startsWith("Curso X"))!.id
  courseYId = courses.find((c) => c.title.startsWith("Curso Y"))!.id
  courseIds.push(courseXId, courseYId)

  offeringYId = await ensureOffering(courseYId, ORG_A)
  await assignOfferingProfessor(offeringYId, professorY.id)

  // Enroll studentA in course X through a real OPEN offering + enrollment row
  // (service-role fixture, D19) so the "enrolled student" case is genuine.
  const { data: offering, error: offeringError } = await supabaseAdmin
    .from("course_offerings")
    .insert({ course_id: courseXId, organization_id: ORG_A, kind: "OPEN", name: "Oferta X" })
    .select("id")
    .single()
  if (offeringError || !offering) throw offeringError ?? new Error("offering not created")
  offeringXId = offering.id
  await assignOfferingProfessor(offering.id, professorX.id)

  const { error: enrollError } = await supabaseAdmin.from("course_enrollments").insert({
    organization_id: ORG_A,
    course_id: courseXId,
    offering_id: offering.id,
    user_id: studentA.id,
    source: "FREE_COURSE",
  })
  if (enrollError) throw enrollError

  seededPath = buildCourseFilePath({ organizationId: ORG_A, courseId: courseXId, offeringId: offeringXId, fileName: "sample.pdf" })
  uploadedPaths.push(seededPath)

  const { error: uploadError } = await supabaseAdmin.storage
    .from(COURSE_FILES_BUCKET)
    .upload(seededPath, PDF_BYTES, { contentType: "application/pdf" })
  if (uploadError) throw uploadError
})

afterAll(async () => {
  await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).remove(uploadedPaths)
  await supabaseAdmin.from("courses").delete().in("id", courseIds)
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

describe("no authenticated SELECT on storage.objects (D10/D26)", () => {
  it("an enrolled student of the same org cannot list() the course's own folder", async () => {
    const { data } = await studentA.client.storage.from(COURSE_FILES_BUCKET).list(`${ORG_A}/${courseXId}/${offeringXId}`)
    const names = (data ?? []).map((f) => f.name)
    expect(names).not.toContain(seededPath.split("/").pop())
  })

  it("an enrolled student of the same org cannot download() the file directly", async () => {
    const { data, error } = await studentA.client.storage.from(COURSE_FILES_BUCKET).download(seededPath)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe("write policy scoped to can_edit_offering(folder[3]) (D10)", () => {
  it("a professor of edition Y cannot upload under edition X's prefix", async () => {
    const hackPath = buildCourseFilePath({ organizationId: ORG_A, courseId: courseXId, offeringId: offeringXId, fileName: "hack.pdf" })

    const { error } = await professorY.client.storage
      .from(COURSE_FILES_BUCKET)
      .upload(hackPath, PDF_BYTES, { contentType: "application/pdf" })

    expect(error).not.toBeNull()
  })

  it("a professor of edition Y cannot delete an object under edition X's prefix", async () => {
    await professorY.client.storage.from(COURSE_FILES_BUCKET).remove([seededPath])

    // RLS filters the delete to zero matching rows rather than raising, so the
    // only reliable proof is that the object is still there afterwards.
    const { data } = await supabaseAdmin.storage
      .from(COURSE_FILES_BUCKET)
      .list(`${ORG_A}/${courseXId}/${offeringXId}`)
    const names = (data ?? []).map((f) => f.name)
    expect(names).toContain(seededPath.split("/").pop())
  })

  it("the assigned professor CAN upload and delete under their own edition prefix (positive control)", async () => {
    const ownPath = buildCourseFilePath({ organizationId: ORG_A, courseId: courseXId, offeringId: offeringXId, fileName: "own.pdf" })

    const { error: uploadError } = await professorX.client.storage
      .from(COURSE_FILES_BUCKET)
      .upload(ownPath, PDF_BYTES, { contentType: "application/pdf" })
    expect(uploadError).toBeNull()

    const { error: removeError } = await professorX.client.storage.from(COURSE_FILES_BUCKET).remove([ownPath])
    expect(removeError).toBeNull()
  })
})
