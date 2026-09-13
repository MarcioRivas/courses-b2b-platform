"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createOrganizationSchema, type CreateOrganizationInput } from "../schemas/organization-schemas"

export interface CreateOrganizationResult {
  organizationId: string
  linkToken: string
}

/**
 * Tenant bootstrap (D23): `create_organization` creates the org, settings,
 * the 4 default score ranges and one ADMIN registration link, and audits
 * itself (`organization.created`) — this action must not log it again.
 */
export async function createOrganization(
  input: CreateOrganizationInput
): Promise<ActionResult<CreateOrganizationResult>> {
  const parsed = createOrganizationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requirePlatformAdmin()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  const row = data?.[0]
  if (!row) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  revalidatePath("/platform/organizations")

  return {
    ok: true,
    data: { organizationId: row.organization_id, linkToken: row.link_token },
  }
}
