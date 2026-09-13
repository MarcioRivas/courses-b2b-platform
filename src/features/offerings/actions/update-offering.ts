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
import { updateOfferingSchema, type UpdateOfferingInput } from "../schemas/offering-schemas"

/**
 * `kind` never changes after creation. Changing `groupId` on a GROUP offering
 * is safe without extra bookkeeping: the next `sync_offering_enrollments`
 * call (triggered right here) adds the new group's members and soft-cancels
 * whoever is no longer a member of the *current* `group_id`, since that RPC
 * always reads the offering's current group (D29).
 */
export async function updateOffering(input: UpdateOfferingInput): Promise<ActionResult<void>> {
  const parsed = updateOfferingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("id, course_id, kind, organization_id")
    .eq("id", parsed.data.offeringId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!offering) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  if (offering.kind === "GROUP" && !parsed.data.groupId) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.groupRequired }
  }
  if (offering.kind === "OPEN" && parsed.data.groupId) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.groupNotAllowed }
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const startsAt = parsed.data.startsAt ? localDateTimeToUtcIso(parsed.data.startsAt, timeZone) : null
  const endsAt = parsed.data.endsAt ? localDateTimeToUtcIso(parsed.data.endsAt, timeZone) : null

  if (startsAt && endsAt && startsAt >= endsAt) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.dateRangeInvalid }
  }

  const { error, data } = await supabase
    .from("course_offerings")
    .update({
      name: parsed.data.name,
      group_id: offering.kind === "GROUP" ? (parsed.data.groupId ?? null) : null,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .eq("id", offering.id)
    .select("id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "offering.updated",
    entityType: "course_offering",
    entityId: offering.id,
  })

  if (offering.kind === "GROUP") {
    await supabase.rpc("sync_offering_enrollments", { p_offering: offering.id })
  }

  revalidatePath(`/admin/courses/${offering.course_id}/offerings`)
  revalidatePath(`/admin/courses/${offering.course_id}/offerings/${offering.id}`)

  return { ok: true, data: undefined }
}
