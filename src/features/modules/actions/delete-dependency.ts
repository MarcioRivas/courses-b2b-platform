"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { deleteDependencySchema, type DeleteDependencyInput } from "../schemas/module-schemas"

export async function deleteDependency(input: DeleteDependencyInput): Promise<ActionResult<void>> {
  const parsed = deleteDependencySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: dependency } = await supabase
    .from("module_dependencies")
    .select("module_id")
    .eq("id", parsed.data.dependencyId)
    .maybeSingle()

  if (!dependency) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { data: offeringId } = await supabase.rpc("offering_id_of_module", { p_module: dependency.module_id })
  if (!offeringId || !(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { error } = await supabase.from("module_dependencies").delete().eq("id", parsed.data.dependencyId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getOfferingOrganizationId(offeringId),
    action: "module_dependency.deleted",
    entityType: "module_dependency",
    entityId: parsed.data.dependencyId,
  })

  await revalidateOfferingContent(offeringId)

  return { ok: true, data: undefined }
}
