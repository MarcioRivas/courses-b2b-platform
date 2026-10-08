import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

/**
 * `sync_offering_enrollments` (D29/D34/§47): idempotent GROUP roster
 * materialisation, revive-on-re-add, soft-cancel only when the departed
 * student has zero progress, and full independence between two offerings of
 * the same course.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const createdCourseIds: string[] = []
const createdGroupIds: string[] = []

afterAll(async () => {
  if (createdCourseIds.length > 0) {
    await supabaseAdmin.from("courses").delete().in("id", createdCourseIds)
  }
  if (createdGroupIds.length > 0) {
    await supabaseAdmin.from("groups").delete().in("id", createdGroupIds)
  }
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

async function makeCourse(title: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({ organization_id: ORG_A, title, access_type: "PRIVATE", status: "DRAFT" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("course not created")
  createdCourseIds.push(data.id)
  return data.id
}

async function makeGroup(name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: ORG_A, name })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("group not created")
  createdGroupIds.push(data.id)
  return data.id
}

async function makeOffering(courseId: string, groupId: string, name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("course_offerings")
    .insert({ course_id: courseId, organization_id: ORG_A, kind: "GROUP", group_id: groupId, name })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("offering not created")
  return data.id
}

async function addToGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("group_members").insert({ group_id: groupId, user_id: userId })
  if (error) throw error
}

async function removeFromGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId)
  if (error) throw error
}

/**
 * Called as a real org admin, not with the service role: the RPC authorises
 * against `is_org_admin`, which is false for the service role because it has no
 * `auth.uid()`. Sharing one admin across the file keeps user creation cheap.
 */
let syncAdmin: Awaited<ReturnType<typeof member>> | null = null

async function syncOffering(offeringId: string): Promise<number> {
  syncAdmin ??= await member("sync-admin", ORG_A, "ADMIN")
  const { data, error } = await syncAdmin.client.rpc("sync_offering_enrollments", {
    p_offering: offeringId,
  })
  if (error) throw error
  return data ?? 0
}

async function getEnrollment(offeringId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("course_enrollments")
    .select("id, status")
    .eq("offering_id", offeringId)
    .eq("user_id", userId)
    .maybeSingle()
  return data
}

describe("sync_offering_enrollments: idempotency", () => {
  it("re-running with no roster change reports zero affected and keeps a single enrollment row", async () => {
    const courseId = await makeCourse("Curso idempotencia")
    const groupId = await makeGroup("Grupo idempotencia")
    const student = await member("sync-idem-student", ORG_A, "STUDENT")
    await addToGroup(groupId, student.id)
    const offeringId = await makeOffering(courseId, groupId, "Oferta idempotencia")

    const first = await syncOffering(offeringId)
    expect(first).toBe(1)

    const second = await syncOffering(offeringId)
    expect(second).toBe(0)

    const { count } = await supabaseAdmin
      .from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("offering_id", offeringId)
      .eq("user_id", student.id)
    expect(count).toBe(1)
  })
})

describe("sync_offering_enrollments: revive on re-add", () => {
  it("restores the same enrollment row to ACTIVE rather than inserting a new one", async () => {
    const courseId = await makeCourse("Curso revive")
    const groupId = await makeGroup("Grupo revive")
    const student = await member("sync-revive-student", ORG_A, "STUDENT")
    await addToGroup(groupId, student.id)
    const offeringId = await makeOffering(courseId, groupId, "Oferta revive")

    await syncOffering(offeringId)
    const original = await getEnrollment(offeringId, student.id)
    expect(original?.status).toBe("ACTIVE")

    await removeFromGroup(groupId, student.id)
    await syncOffering(offeringId)
    const cancelled = await getEnrollment(offeringId, student.id)
    expect(cancelled?.id).toBe(original?.id)
    expect(cancelled?.status).toBe("CANCELLED")

    await addToGroup(groupId, student.id)
    await syncOffering(offeringId)
    const revived = await getEnrollment(offeringId, student.id)
    expect(revived?.id).toBe(original?.id)
    expect(revived?.status).toBe("ACTIVE")
  })
})

describe("sync_offering_enrollments: cancels only zero-progress departures", () => {
  it("leaves a departed student with progress ACTIVE but cancels one with none", async () => {
    const courseId = await makeCourse("Curso progreso")
    const groupId = await makeGroup("Grupo progreso")
    const withProgress = await member("sync-progress-yes", ORG_A, "STUDENT")
    const withoutProgress = await member("sync-progress-no", ORG_A, "STUDENT")
    await addToGroup(groupId, withProgress.id)
    await addToGroup(groupId, withoutProgress.id)
    const offeringId = await makeOffering(courseId, groupId, "Oferta progreso")
    await syncOffering(offeringId)

    const { data: module } = await supabaseAdmin
      .from("modules")
      .insert({ offering_id: offeringId, title: "Módulo", position: 1 })
      .select("id")
      .single()
    const { data: lesson } = await supabaseAdmin
      .from("lessons")
      .insert({ module_id: module!.id, title: "Lección", position: 1 })
      .select("id")
      .single()
    const { data: block } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({ lesson_id: lesson!.id, type: "RICH_TEXT", position: 1, data: { html: "<p>hola</p>" } })
      .select("id")
      .single()

    const enrollmentWithProgress = await getEnrollment(offeringId, withProgress.id)
    await supabaseAdmin
      .from("content_progress")
      .insert({ enrollment_id: enrollmentWithProgress!.id, content_block_id: block!.id })

    await removeFromGroup(groupId, withProgress.id)
    await removeFromGroup(groupId, withoutProgress.id)
    await syncOffering(offeringId)

    const stillActive = await getEnrollment(offeringId, withProgress.id)
    const nowCancelled = await getEnrollment(offeringId, withoutProgress.id)
    expect(stillActive?.status).toBe("ACTIVE")
    expect(nowCancelled?.status).toBe("CANCELLED")
  })
})

describe("two offerings of one course: independent schedules and enrollments", () => {
  it("keeps rosters and module schedules scoped to their own offering", async () => {
    const courseId = await makeCourse("Curso paralelo")
    const groupOne = await makeGroup("Grupo 1")
    const groupTwo = await makeGroup("Grupo 2")
    const studentOne = await member("sync-parallel-1", ORG_A, "STUDENT")
    const studentTwo = await member("sync-parallel-2", ORG_A, "STUDENT")
    await addToGroup(groupOne, studentOne.id)
    await addToGroup(groupTwo, studentTwo.id)

    const offeringOne = await makeOffering(courseId, groupOne, "Oferta 1")
    const offeringTwo = await makeOffering(courseId, groupTwo, "Oferta 2")
    await syncOffering(offeringOne)
    await syncOffering(offeringTwo)

    expect(await getEnrollment(offeringOne, studentOne.id)).not.toBeNull()
    expect(await getEnrollment(offeringOne, studentTwo.id)).toBeNull()
    expect(await getEnrollment(offeringTwo, studentTwo.id)).not.toBeNull()
    expect(await getEnrollment(offeringTwo, studentOne.id)).toBeNull()

    const { data: module } = await supabaseAdmin
      .from("modules")
      .insert({ offering_id: offeringOne, title: "Módulo paralelo", position: 1 })
      .select("id")
      .single()

    const from1 = new Date().toISOString()
    await supabaseAdmin
      .from("offering_module_schedules")
      .insert({ offering_id: offeringOne, module_id: module!.id, available_from: from1 })

    const { data: scheduleOne } = await supabaseAdmin
      .from("offering_module_schedules")
      .select("available_from")
      .eq("offering_id", offeringOne)
      .eq("module_id", module!.id)
      .maybeSingle()
    const { data: scheduleTwo } = await supabaseAdmin
      .from("offering_module_schedules")
      .select("available_from")
      .eq("offering_id", offeringTwo)
      .eq("module_id", module!.id)
      .maybeSingle()

    // Postgres round-trips timestamptz as "+00:00", not "Z" — compare instants.
    expect(new Date(scheduleOne!.available_from!).getTime()).toBe(new Date(from1).getTime())
    expect(scheduleTwo).toBeNull()
  })
})

describe("sync_offering_enrollments: authorization (review finding C1)", () => {
  it("refuses a student of an unrelated organization", async () => {
    // Before this guard existed, any authenticated user could call the RPC for
    // any offering id and revive every CANCELLED enrollment in that tenant,
    // silently undoing an admin's revocation.
    const outsider = await member("sync-outsider-b", ORG_B, "STUDENT")
    const courseId = await makeCourse("Curso outsider")
    const groupId = await makeGroup("Grupo outsider")
    const offeringId = await makeOffering(courseId, groupId, "Oferta outsider")
    const student = await member("sync-outsider-target", ORG_A, "STUDENT")
    await addToGroup(groupId, student.id)
    await syncOffering(offeringId)

    await supabaseAdmin
      .from("course_enrollments")
      .update({ status: "CANCELLED" })
      .eq("offering_id", offeringId)

    const { error } = await outsider.client.rpc("sync_offering_enrollments", {
      p_offering: offeringId,
    })
    expect(error?.code).toBe("42501")

    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("status")
      .eq("offering_id", offeringId)
    expect((data ?? []).every((row) => row.status === "CANCELLED")).toBe(true)
  })

  it("refuses an admin of a different organization", async () => {
    const foreignAdmin = await member("sync-foreign-admin", ORG_B, "ADMIN")
    const courseId = await makeCourse("Curso foreign")
    const groupId = await makeGroup("Grupo foreign")
    const offeringId = await makeOffering(courseId, groupId, "Oferta foreign")

    const { error } = await foreignAdmin.client.rpc("sync_offering_enrollments", {
      p_offering: offeringId,
    })
    expect(error?.code).toBe("42501")
  })
})
