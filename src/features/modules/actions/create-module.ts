"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createModuleSchema, type CreateModuleInput } from "../schemas/module-schemas"

export async function createModule(input: CreateModuleInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])

  if (!(await canEditOffering(parsed.data.offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const supabase = await createClient()

  const { data: last } = await supabase
    .from("modules")
    .select("position")
    .eq("offering_id", parsed.data.offeringId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (last?.position ?? 0) + 1

  const { data, error } = await supabase
    .from("modules")
    .insert({
      offering_id: parsed.data.offeringId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      position: nextPosition,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getOfferingOrganizationId(parsed.data.offeringId),
    action: "module.created",
    entityType: "module",
    entityId: data.id,
    metadata: { title: parsed.data.title, offeringId: parsed.data.offeringId },
  })

  await revalidateOfferingContent(parsed.data.offeringId)

  return { ok: true, data: { id: data.id } }
}
