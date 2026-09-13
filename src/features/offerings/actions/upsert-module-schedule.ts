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
import { upsertModuleScheduleSchema, type UpsertModuleScheduleInput } from "../schemas/offering-schemas"

/** Empty from/until means "always available" — upserts nulls rather than deleting the row (can_view_block treats both identically). */
export async function upsertModuleSchedule(input: UpsertModuleScheduleInput): Promise<ActionResult<void>> {
  const parsed = upsertModuleScheduleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("id, course_id")
    .eq("id", parsed.data.offeringId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!offering) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const availableFrom = parsed.data.availableFrom ? localDateTimeToUtcIso(parsed.data.availableFrom, timeZone) : null
  const availableUntil = parsed.data.availableUntil
    ? localDateTimeToUtcIso(parsed.data.availableUntil, timeZone)
    : null

  const { error } = await supabase.from("offering_module_schedules").upsert(
    {
      offering_id: offering.id,
      module_id: parsed.data.moduleId,
      available_from: availableFrom,
      available_until: availableUntil,
    },
    { onConflict: "offering_id,module_id" }
  )

  if (error) {
    if (error.code === "23514") {
      return { ok: false, code: "VALIDATION", message: offeringMessages.errors.dateRangeInvalid }
    }
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "offering.schedule_updated",
    entityType: "course_offering",
    entityId: offering.id,
    metadata: { moduleId: parsed.data.moduleId },
  })

  revalidatePath(`/admin/courses/${offering.course_id}/offerings/${offering.id}`)

  return { ok: true, data: undefined }
}
