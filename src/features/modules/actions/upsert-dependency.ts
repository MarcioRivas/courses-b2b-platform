"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
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

  const [{ data: offeringOfModule }, { data: offeringOfPrereq }] = await Promise.all([
    supabase.rpc("offering_id_of_module", { p_module: moduleId }),
    supabase.rpc("offering_id_of_module", { p_module: dependsOnModuleId }),
  ])

  if (!offeringOfModule || !offeringOfPrereq) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (offeringOfModule !== offeringOfPrereq) {
    return { ok: false, code: "VALIDATION", message: contentMessages.errors.dependencyCourseMismatch }
  }
  if (!(await canEditOffering(offeringOfModule))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: offeringModules } = await supabase.from("modules").select("id").eq("offering_id", offeringOfModule)
  const moduleIds = (offeringModules ?? []).map((m) => m.id)

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
    organizationId: await getOfferingOrganizationId(offeringOfModule),
    action: "module_dependency.upserted",
    entityType: "module_dependency",
    entityId: inserted.id,
    metadata: { moduleId, dependsOnModuleId, condition: "MODULE_COMPLETED" },
  })

  await revalidateOfferingContent(offeringOfModule)

  return { ok: true, data: { id: inserted.id } }
}

async function upsertQuizPassedDependency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: Extract<UpsertDependencyInput, { condition: "QUIZ_PASSED" }>
): Promise<ActionResult<{ id: string }>> {
  const { moduleId, assessmentId, minScore } = data

  const { data: offeringOfModule } = await supabase.rpc("offering_id_of_module", { p_module: moduleId })
  if (!offeringOfModule) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(offeringOfModule))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, offering_id, kind")
    .eq("id", assessmentId)
    .maybeSingle()

  if (!assessment || assessment.kind !== "QUIZ" || assessment.offering_id !== offeringOfModule) {
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
    organizationId: await getOfferingOrganizationId(offeringOfModule),
    action: "module_dependency.upserted",
    entityType: "module_dependency",
    entityId: inserted.id,
    metadata: { moduleId, assessmentId, minScore, condition: "QUIZ_PASSED" },
  })

  await revalidateOfferingContent(offeringOfModule)

  return { ok: true, data: { id: inserted.id } }
}
