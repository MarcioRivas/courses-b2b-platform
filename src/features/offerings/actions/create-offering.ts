"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { localDateTimeToUtcIso } from "../lib/local-datetime"
import { createOfferingSchema, type CreateOfferingInput } from "../schemas/offering-schemas"

/**
 * Creates a GROUP edition through the `create_offering` RPC (admin-only,
 * one transaction: insert + optional `copy_edition_content` from
 * `fromOfferingId`, audit written server-side). FREE courses keep their
 * single OPEN edition managed by `publish_course`; the RPC refuses them.
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

  if (course.access_type !== "PRIVATE") {
    return { ok: false, code: "CONFLICT", message: messages.errors.OFFERING_KIND_MISMATCH }
  }

  if (!parsed.data.groupId) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.groupRequired }
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const startsAt = parsed.data.startsAt ? localDateTimeToUtcIso(parsed.data.startsAt, timeZone) : null
  const endsAt = parsed.data.endsAt ? localDateTimeToUtcIso(parsed.data.endsAt, timeZone) : null

  if (startsAt && endsAt && startsAt >= endsAt) {
    return { ok: false, code: "VALIDATION", message: offeringMessages.errors.dateRangeInvalid }
  }

  const { data: offeringId, error } = await supabase.rpc("create_offering", {
    p_course: course.id,
    p_name: parsed.data.name,
    p_group: parsed.data.groupId,
    p_starts: startsAt ?? undefined,
    p_ends: endsAt ?? undefined,
    p_from_offering: parsed.data.fromOfferingId,
  })

  if (error || !offeringId) {
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath(`/admin/courses/${course.id}/offerings`)

  return { ok: true, data: { id: offeringId } }
}
