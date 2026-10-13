"use server"

import { revalidateAssessment } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { updateAssessmentConfigSchema, type UpdateAssessmentConfigInput } from "../schemas/assessment-schemas"
import { configToColumns } from "../lib/assessment-config-values"
import { getAssessmentWizardContext } from "../queries/get-assessment-editor-data"

/**
 * Same minute? The form only carries minutes (`datetime-local`), so a stored
 * window with seconds must still compare equal to its unchanged form value.
 */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000)
  return minute(a) === minute(b)
}

/**
 * Wizard step 1 save (edit mode). The kind is fixed at creation and never
 * changes. A PUBLISHED EXAM's window/duration only moves through
 * `extendWindow` (D32), which also nudges in-flight attempts — a direct edit
 * would silently desync `effective_end_at`.
 */
export async function updateAssessment(input: UpdateAssessmentConfigInput): Promise<ActionResult<void>> {
  const parsed = updateAssessmentConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("id, offering_id, organization_id, status, kind, duration_seconds, available_from, available_until")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(existing.offering_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { timeZone } = await getAssessmentWizardContext(existing.organization_id)
  // The stored kind wins over whatever the client sent.
  const columns = configToColumns({ ...parsed.data.config, kind: existing.kind }, timeZone)

  if (existing.status === "PUBLISHED" && existing.kind === "EXAM") {
    const windowChanged =
      columns.duration_seconds !== existing.duration_seconds ||
      !sameInstant(columns.available_from, existing.available_from) ||
      !sameInstant(columns.available_until, existing.available_until)

    if (windowChanged) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.publishedWindowLocked }
    }
  }

  // Unchanged window of a published exam: keep the stored instants untouched.
  const update =
    existing.status === "PUBLISHED" && existing.kind === "EXAM"
      ? { ...columns, duration_seconds: undefined, available_from: undefined, available_until: undefined }
      : columns

  const { error } = await supabase.from("assessments").update(update).eq("id", existing.id)
  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  if (existing.kind !== "EXAM" && parsed.data.isRequired !== undefined) {
    const { error: blockError } = await supabase
      .from("lesson_content_blocks")
      .update({ is_required: parsed.data.isRequired })
      .eq("assessment_id", existing.id)
    if (blockError) {
      return { ok: false, ...toActionError(blockError) }
    }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: "assessment.updated",
    entityType: "assessment",
    entityId: existing.id,
    metadata: { kind: existing.kind },
  })

  await revalidateAssessment(existing.offering_id, existing.kind, existing.id)

  return { ok: true, data: undefined }
}
