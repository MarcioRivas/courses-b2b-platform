"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { upsertDependencySchema, type UpsertDependencyInput } from "../schemas/module-schemas"
import { wouldCreateDependencyCycle } from "../lib/detect-dependency-cycle"

/** MODULE_COMPLETED (cycle-checked) or QUIZ_PASSED (Phase 5, assessment + min score). */
export async function upsertDependency(
  input: UpsertDependencyInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = upsertDependencySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  if (parsed.data.condition === "QUIZ_PASSED") {
    return upsertQuizPassedDependency(supabase, parsed.data)
  }
  return upsertModuleCompletedDependency(supabase, parsed.data)
}

async function upsertModuleCompletedDependency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: Extract<UpsertDependencyInput, { condition: "MODULE_COMPLETED" }>
): Promise<ActionResult<{ id: string }>> {
  const { moduleId, dependsOnModuleId } = data

  if (moduleId === dependsOnModuleId) {
    return { ok: false, code: "CONFLICT", message: contentMessages.errors.selfDependency }
  }

  const [{ data: courseOfModule }, { data: courseOfPrereq }] = await Promise.all([
    supabase.rpc("course_id_of_module", { p_module: moduleId }),
    supabase.rpc("course_id_of_module", { p_module: dependsOnModuleId }),
  ])

  if (!courseOfModule || !courseOfPrereq) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (courseOfModule !== courseOfPrereq) {
    return { ok: false, code: "VALIDATION", message: contentMessages.errors.dependencyCourseMismatch }
  }
  if (!(await canEditCourse(courseOfModule))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: courseModules } = await supabase.from("modules").select("id").eq("course_id", courseOfModule)
  const moduleIds = (courseModules ?? []).map((m) => m.id)

  const { data: existingEdges } = await supabase
    .from("module_dependencies")
    .select("module_id, depends_on_module_id")
    .eq("condition", "MODULE_COMPLETED")
    .in("module_id", moduleIds)

  const edges = (existingEdges ?? [])
    .filter((e) => e.depends_on_module_id !== null)
    .map((e) => ({ moduleId: e.module_id, dependsOnModuleId: e.depends_on_module_id as string }))

  if (wouldCreateDependencyCycle(edges, { moduleId, dependsOnModuleId })) {
    return { ok: false, code: "CONFLICT", message: contentMessages.errors.cycleDetected }
  }

  // Idempotent: an identical row already covers the requirement.
  const { data: existingRow } = await supabase
    .from("module_dependencies")
    .select("id")
    .eq("module_id", moduleId)
    .eq("depends_on_module_id", dependsOnModuleId)
    .eq("condition", "MODULE_COMPLETED")
    .maybeSingle()

  if (existingRow) {
    return { ok: true, data: { id: existingRow.id } }
  }

  const { data: inserted, error } = await supabase
    .from("module_dependencies")
    .insert({ module_id: moduleId, condition: "MODULE_COMPLETED", depends_on_module_id: dependsOnModuleId })
    .select("id")
    .single()

  if (error || !inserted) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseOfModule),
    action: "module_dependency.upserted",
    entityType: "module_dependency",
    entityId: inserted.id,
    metadata: { moduleId, dependsOnModuleId, condition: "MODULE_COMPLETED" },
  })

  revalidatePath(`/admin/courses/${courseOfModule}/content`)
  revalidatePath(`/teach/courses/${courseOfModule}/content`)

  return { ok: true, data: { id: inserted.id } }
}

async function upsertQuizPassedDependency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: Extract<UpsertDependencyInput, { condition: "QUIZ_PASSED" }>
): Promise<ActionResult<{ id: string }>> {
  const { moduleId, assessmentId, minScore } = data

  const { data: courseOfModule } = await supabase.rpc("course_id_of_module", { p_module: moduleId })
  if (!courseOfModule) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(courseOfModule))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, course_id, kind")
    .eq("id", assessmentId)
    .maybeSingle()

  if (!assessment || assessment.kind !== "QUIZ" || assessment.course_id !== courseOfModule) {
    return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.dependencyCourseMismatch }
  }

  const { data: inserted, error } = await supabase
    .from("module_dependencies")
    .insert({ module_id: moduleId, condition: "QUIZ_PASSED", assessment_id: assessmentId, min_score: minScore })
    .select("id")
    .single()

  if (error || !inserted) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseOfModule),
    action: "module_dependency.upserted",
    entityType: "module_dependency",
    entityId: inserted.id,
    metadata: { moduleId, assessmentId, minScore, condition: "QUIZ_PASSED" },
  })

  revalidatePath(`/admin/courses/${courseOfModule}/content`)
  revalidatePath(`/teach/courses/${courseOfModule}/content`)

  return { ok: true, data: { id: inserted.id } }
}
