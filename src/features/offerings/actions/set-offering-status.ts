"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { setOfferingStatusSchema, type SetOfferingStatusInput } from "../schemas/offering-schemas"

export async function setOfferingStatus(input: SetOfferingStatusInput): Promise<ActionResult<void>> {
  const parsed = setOfferingStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_offerings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.offeringId)
    .eq("organization_id", ctx.organizationId)
    .select("id, course_id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "offering.status_changed",
    entityType: "course_offering",
    entityId: parsed.data.offeringId,
    metadata: { status: parsed.data.status },
  })

  revalidatePath(`/admin/courses/${data[0]!.course_id}/offerings`)
  revalidatePath(`/admin/courses/${data[0]!.course_id}/offerings/${parsed.data.offeringId}`)

  return { ok: true, data: undefined }
}
