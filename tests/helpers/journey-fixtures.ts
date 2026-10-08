import { assignOfferingProfessor } from "./course-fixtures"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { psql } from "./sql"
import { supabaseAdmin } from "./supabase-admin"

export const JOURNEY_ORG = "11111111-1111-1111-1111-111111111111"

export interface JourneyCourse {
  courseId: string
  /** The GROUP edition that owns the content (B2). */
  offeringId: string
  groupId: string
  module1Id: string
  module1LessonId: string
  module2Id: string
  module2LessonId: string
}

/**
 * Builds a DRAFT course with two modules (one required RICH_TEXT block each)
 * via the service role. Module/lesson/block *UI* authoring is already
 * exercised end-to-end by `course-builder.spec.ts`; the full journey below
 * publishes this course through the real admin UI and spends its (200-line)
 * budget on the parts unique to it: registration, the QUIZ_PASSED unlock,
 * the offline segment and grading.
 */
export async function buildJourneyCourse(title: string): Promise<JourneyCourse> {
  const { data: course, error } = await supabaseAdmin
    .from("courses")
    .insert({ organization_id: JOURNEY_ORG, title, status: "DRAFT", access_type: "PRIVATE" })
    .select("id")
    .single()
  if (error || !course) throw error ?? new Error("course not created")

  // Content belongs to the edition: group + GROUP edition first, modules on it.
  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: JOURNEY_ORG, name: `Grupo jornada ${Date.now()}` })
    .select("id")
    .single()
  if (groupError || !group) throw groupError ?? new Error("group not created")

  const { data: offering, error: offeringError } = await supabaseAdmin
    .from("course_offerings")
    .insert({ course_id: course.id, organization_id: JOURNEY_ORG, kind: "GROUP", group_id: group.id, name: "Oferta jornada" })
    .select("id")
    .single()
  if (offeringError || !offering) throw offeringError ?? new Error("offering not created")

  const [module1, module2] = await Promise.all([
    insertModuleWithLesson(offering.id, "Módulo 1", 1),
    insertModuleWithLesson(offering.id, "Módulo 2", 2),
  ])

  return {
    courseId: course.id,
    offeringId: offering.id,
    groupId: group.id,
    module1Id: module1.moduleId,
    module1LessonId: module1.lessonId,
    module2Id: module2.moduleId,
    module2LessonId: module2.lessonId,
  }
}

async function insertModuleWithLesson(
  offeringId: string,
  title: string,
  position: number
): Promise<{ moduleId: string; lessonId: string }> {
  const { data: module } = await supabaseAdmin
    .from("modules")
    .insert({ offering_id: offeringId, title, position })
    .select("id")
    .single()
  if (!module) throw new Error("module not created")

  const { data: lesson } = await supabaseAdmin
    .from("lessons")
    .insert({ module_id: module.id, title: `${title} — lección`, position: 1 })
    .select("id")
    .single()
  if (!lesson) throw new Error("lesson not created")

  await supabaseAdmin.from("lesson_content_blocks").insert({
    lesson_id: lesson.id,
    type: "RICH_TEXT",
    position: 1,
    data: { html: `<p>${title}</p>` },
    is_required: true,
  })

  return { moduleId: module.id, lessonId: lesson.id }
}

/** QUIZ_PASSED gate on module 2 (mirrors `upsert-dependency.ts`'s shape). */
export async function gateModuleOnQuiz(moduleId: string, assessmentId: string, minScore: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("module_dependencies")
    .insert({ module_id: moduleId, condition: "QUIZ_PASSED", assessment_id: assessmentId, min_score: minScore })
  if (error) throw error
}

/** A fresh, single-use registration link — never reuse `demo-link-org-a` (shared with other spec files). */
export async function createRegistrationLink(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organization_registration_links")
    .insert({ organization_id: JOURNEY_ORG, label: "full-journey" })
    .select("token")
    .single()
  if (error || !data) throw error ?? new Error("registration link not created")
  return data.token
}

/**
 * The journey course's GROUP edition (created by `buildJourneyCourse`), then
 * the real `sync_offering_enrollments` RPC — the same one the "Sincronizar
 * inscripciones" button calls — materialises the enrollment once `studentId`
 * has joined the group. The RPC asserts `is_org_admin()` from `auth.uid()`
 * internally, so it must run as the signed-in admin's client, not the
 * service role (which has no `auth.uid()`).
 */
export async function enrollViaGroupOffering(
  course: Pick<JourneyCourse, "offeringId" | "groupId">,
  studentId: string,
  adminClient: SupabaseClient<Database>,
  professorId?: string
): Promise<string> {
  const offering = { id: course.offeringId }
  const group = { id: course.groupId }
  if (professorId) await assignOfferingProfessor(offering.id, professorId)

  const { error: memberError } = await supabaseAdmin.from("group_members").insert({ group_id: group.id, user_id: studentId })
  if (memberError) throw memberError

  const { data: affected, error: syncError } = await adminClient.rpc("sync_offering_enrollments", {
    p_offering: offering.id,
  })
  if (syncError) throw syncError

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("id")
    .eq("offering_id", offering.id)
    .eq("user_id", studentId)
    .single()
  if (!enrollment) throw new Error(`enrollment not synced (rpc affected ${affected})`)
  return enrollment.id
}

/** E2E never sees a user id from the browser — resolved by email via a direct psql lookup (mirrors `deleteUserByEmail`). */
export function userIdByEmail(email: string): string {
  const id = psql(`select id from auth.users where email = '${email.replace(/'/g, "''")}';`)
  if (!id) throw new Error(`no user found for ${email}`)
  return id
}
