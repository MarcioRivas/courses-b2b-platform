"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createBankSchema, type CreateBankInput } from "../schemas/question-schemas"

/**
 * Direct table write authorised by RLS (`question_banks_all` /
 * `can_edit_question_bank`, 5A step 1) — no bespoke server check needed
 * beyond the role gate; a professor without course access simply gets a
 * policy-denied insert, mapped to FORBIDDEN by `toActionError` (42501).
 */
export async function createBank(input: CreateBankInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createBankSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("question_banks")
    .insert({
      organization_id: ctx.organizationId,
      course_id: parsed.data.courseId ?? null,
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "question_bank.created",
    entityType: "question_bank",
    entityId: data.id,
    metadata: { name: parsed.data.name, courseId: parsed.data.courseId ?? null },
  })

  revalidatePath("/teach/banks")

  return { ok: true, data: { id: data.id } }
}
