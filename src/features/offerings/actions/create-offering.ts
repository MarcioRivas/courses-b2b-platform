"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { localDateTimeToUtcIso } from "../lib/local-datetime"
import { createOfferingSchema, type CreateOfferingInput } from "../schemas/offering-schemas"

/**
 * `kind` is derived from `courses.access_type`, never client-chosen (D25):
 * PRIVATE courses get a GROUP offering (group required), FREE courses an
 * OPEN one. `publish_course` already auto-creates the single OPEN offering
 * for a FREE course (D13) — the partial unique index rejects a second one
 * with 23505, which `toActionError` maps to a plain CONFLICT.
 */
export async function createOffering(input: CreateOfferingInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createOfferingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: course } = await supabase
    .from("courses")
    .select("id, organization_id, access_type")
    .eq("id", parsed.data.courseId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!course) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const kind = course.access_type === "PRIVATE" ? "GROUP" : "OPEN"

  if (kind === "GROUP" && !parsed.data.groupId) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.groupRequired }
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const startsAt = parsed.data.startsAt ? localDateTimeToUtcIso(parsed.data.startsAt, timeZone) : null
  const endsAt = parsed.data.endsAt ? localDateTimeToUtcIso(parsed.data.endsAt, timeZone) : null

  if (startsAt && endsAt && startsAt >= endsAt) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.dateRangeInvalid }
  }

  const { data, error } = await supabase
    .from("course_offerings")
    .insert({
      course_id: course.id,
      organization_id: course.organization_id,
      kind,
      group_id: kind === "GROUP" ? (parsed.data.groupId ?? null) : null,
      name: parsed.data.name,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "offering.created",
    entityType: "course_offering",
    entityId: data.id,
    metadata: { courseId: course.id, kind },
  })

  // Materialise the roster immediately for GROUP offerings rather than
  // waiting for the next group membership change.
  if (kind === "GROUP") {
    await supabase.rpc("sync_offering_enrollments", { p_offering: data.id })
  }

  revalidatePath(`/admin/courses/${course.id}/offerings`)

  return { ok: true, data: { id: data.id } }
}
