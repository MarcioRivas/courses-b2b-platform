"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateAssessmentSchema, type UpdateAssessmentInput } from "../schemas/assessment-schemas"
import { localDateTimeToUtcIso } from "../lib/local-datetime"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

/** Instant equality tolerant of ISO string formatting differences (`+00:00` vs `Z`, trailing `.000`). */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}

/**
 * Full config write (5B step 3): QUIZ always forces attempts/duration/window
 * back to NULL server-side regardless of what a stale client form sent
 * (D25 — never trust the client for rules the DB itself encodes as CHECKs).
 *
 * M3 fix: once PUBLISHED, `kind` is locked (a published assessment's shape
 * is a contract with in-flight/completed attempts); `kind` is also locked
 * the moment a lesson content block or module dependency references the
 * assessment, published or not. A PUBLISHED EXAM's window/duration can only
 * move through `extendWindow` (D32), which also nudges in-flight attempts —
 * a direct edit here would silently desync `effective_end_at`.
 */
export async function updateAssessment(input: UpdateAssessmentInput): Promise<ActionResult<void>> {
  const parsed = updateAssessmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("id, course_id, organization_id, status, kind, duration_seconds, available_from, available_until")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(existing.course_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { kind } = parsed.data

  if (kind !== existing.kind) {
    if (existing.status === "PUBLISHED") {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.publishedKindLocked }
    }

    const [{ count: blockCount }, { count: dependencyCount }] = await Promise.all([
      supabase.from("lesson_content_blocks").select("id", { count: "exact", head: true }).eq("assessment_id", existing.id),
      supabase.from("module_dependencies").select("id", { count: "exact", head: true }).eq("assessment_id", existing.id),
    ])

    if ((blockCount ?? 0) > 0 || (dependencyCount ?? 0) > 0) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.kindReferencedLocked }
    }
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  const maxAttempts = kind === "QUIZ" ? null : parsed.data.maxAttempts ? Number(parsed.data.maxAttempts) : null
  const durationSeconds =
    kind === "QUIZ" ? null : parsed.data.durationMinutes ? Number(parsed.data.durationMinutes) * 60 : null
  const availableFrom = kind === "QUIZ" || !parsed.data.availableFrom ? null : localDateTimeToUtcIso(parsed.data.availableFrom, timeZone)
  const availableUntil = kind === "QUIZ" || !parsed.data.availableUntil ? null : localDateTimeToUtcIso(parsed.data.availableUntil, timeZone)

  if (existing.status === "PUBLISHED" && existing.kind === "EXAM") {
    const windowChanged =
      durationSeconds !== existing.duration_seconds ||
      !sameInstant(availableFrom, existing.available_from) ||
      !sameInstant(availableUntil, existing.available_until)

    if (windowChanged) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.publishedWindowLocked }
    }
  }

  const { error } = await supabase
    .from("assessments")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      kind,
      passing_score: Number(parsed.data.passingScore),
      max_attempts: maxAttempts,
      duration_seconds: durationSeconds,
      available_from: availableFrom,
      available_until: availableUntil,
    })
    .eq("id", existing.id)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: "assessment.updated",
    entityType: "assessment",
    entityId: existing.id,
    metadata: { kind },
  })

  revalidatePath(`/teach/courses/${existing.course_id}/assessments`)
  revalidatePath(`/teach/courses/${existing.course_id}/assessments/${existing.id}`)

  return { ok: true, data: undefined }
}
