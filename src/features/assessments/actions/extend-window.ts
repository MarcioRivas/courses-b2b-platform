"use server"

import { revalidateOfferingExams } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { extendWindowSchema, type ExtendWindowInput } from "../schemas/assessment-schemas"
import { localDateTimeToUtcIso } from "../lib/local-datetime"

/** Exam-day incident handling (D32): moves the deadline and every in-flight attempt's `effective_end_at`. */
export async function extendWindow(input: ExtendWindowInput): Promise<ActionResult<{ attemptsUpdated: number }>> {
  const parsed = extendWindowSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("offering_id")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const newUntilIso = localDateTimeToUtcIso(parsed.data.newUntil, timeZone)

  const { data, error } = await supabase.rpc("extend_assessment_window", {
    p_assessment: parsed.data.assessmentId,
    p_new_until: newUntilIso,
  })

  if (error) {
    if (error.message.includes("INVALID_ANSWER")) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.assessments.extendWindow.invalidDate }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (existing) {
    await revalidateOfferingExams(existing.offering_id, parsed.data.assessmentId)
  }

  return { ok: true, data: { attemptsUpdated: data ?? 0 } }
}
