"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { offeringProfessorSchema, type OfferingProfessorInput } from "../schemas/offering-schemas"

export async function unassignOfferingProfessor(input: OfferingProfessorInput): Promise<ActionResult<void>> {
  const parsed = offeringProfessorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("organization_id, course_id")
    .eq("id", parsed.data.offeringId)
    .maybeSingle()
  if (!offering) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { error, data } = await supabase
    .from("offering_professors")
    .delete()
    .eq("offering_id", parsed.data.offeringId)
    .eq("user_id", parsed.data.userId)
    .select("offering_id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: offering.organization_id,
    action: "offering.professor_unassigned",
    entityType: "course_offering",
    entityId: parsed.data.offeringId,
    metadata: { userId: parsed.data.userId },
  })

  revalidatePath("/admin/courses/[courseId]/offerings/[offeringId]/professors", "page")
  revalidatePath(`/admin/courses/${offering.course_id}/offerings`)
  revalidatePath("/teach/courses")

  return { ok: true, data: undefined }
}
