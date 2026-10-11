"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { startConversationSchema, type StartConversationInput } from "../schemas/messaging-schemas"
import { messagingRpcErrorResult } from "../lib/messaging-errors"
import { MESSAGING_ROLES } from "../lib/messaging-roles"

/**
 * Get-or-create the 1:1 conversation with another member. `start_conversation`
 * derives the org from the caller's membership and refuses anyone outside it.
 */
export async function startConversation(
  input: StartConversationInput
): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = startConversationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(MESSAGING_ROLES)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("start_conversation", { p_user: parsed.data.userId })
  if (error || !data) {
    return messagingRpcErrorResult(error)
  }

  return { ok: true, data: { conversationId: data } }
}
