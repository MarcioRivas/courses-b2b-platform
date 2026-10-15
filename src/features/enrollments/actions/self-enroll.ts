"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { learnMessages } from "@/lib/messages/learn"
import { selfEnrollSchema, type SelfEnrollInput } from "../schemas/enrollment-schemas"

/**
 * Joins a PUBLISHED FREE course through `self_enroll_free_course`, which is
 * idempotent: calling it twice returns the same enrollment id instead of
 * creating a second row (D13).
 */
export async function selfEnroll(input: SelfEnrollInput): Promise<ActionResult<{ enrollmentId: string }>> {
  const parsed = selfEnrollSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("self_enroll_free_course", {
    p_course: parsed.data.courseId,
  })

  if (error || !data) {
    return error
      ? { ok: false, ...toActionError(error) }
      : { ok: false, code: "INTERNAL", message: learnMessages.errors.enrollFailed }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "enrollment.self_enrolled",
    entityType: "course_enrollment",
    entityId: data,
    metadata: { courseId: parsed.data.courseId },
  })

  revalidatePath("/learn")

  return { ok: true, data: { enrollmentId: data } }
}
