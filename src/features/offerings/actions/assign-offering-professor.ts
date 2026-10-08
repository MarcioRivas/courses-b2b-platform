"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { offeringProfessorSchema, type OfferingProfessorInput } from "../schemas/offering-schemas"

/**
 * Direct insert into `offering_professors` (admin write policy). The BEFORE
 * INSERT trigger `assert_active_member_of_org` raises a bare P0001 for a
 * non-ACTIVE-PROFESSOR or cross-org target.
 */
export async function assignOfferingProfessor(input: OfferingProfessorInput): Promise<ActionResult<void>> {
  const parsed = offeringProfessorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("organization_id, course_id")
    .eq("id", parsed.data.offeringId)
    .maybeSingle()
  if (!offering) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { error } = await supabase.from("offering_professors").insert({
    offering_id: parsed.data.offeringId,
    user_id: parsed.data.userId,
    assigned_by: ctx.user.id,
  })

  if (error) {
    if (error.code === "P0001" && error.message.includes("does not have an ACTIVE")) {
      return { ok: false, code: "CONFLICT", message: offeringMessages.professors.invalidProfessor }
    }
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: offering.organization_id,
    action: "offering.professor_assigned",
    entityType: "course_offering",
    entityId: parsed.data.offeringId,
    metadata: { userId: parsed.data.userId },
  })

  revalidatePath("/admin/courses/[courseId]/offerings/[offeringId]/professors", "page")
  revalidatePath(`/admin/courses/${offering.course_id}/offerings`)
  revalidatePath("/teach/courses")

  return { ok: true, data: undefined }
}
