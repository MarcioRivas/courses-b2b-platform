"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { markConversationReadSchema, type MarkConversationReadInput } from "../schemas/messaging-schemas"
import { messagingRpcErrorResult } from "../lib/messaging-errors"
import { MESSAGING_ROLES } from "../lib/messaging-roles"

/** Marks the conversation read up to `upTo` (the newest message shown), never past it. */
export async function markConversationRead(input: MarkConversationReadInput): Promise<ActionResult<null>> {
  const parsed = markConversationReadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(MESSAGING_ROLES)
  const supabase = await createClient()

  const { error } = await supabase.rpc("mark_conversation_read", {
    p_conversation: parsed.data.conversationId,
    p_up_to: parsed.data.upTo,
  })
  if (error) {
    return messagingRpcErrorResult(error)
  }

  return { ok: true, data: null }
}
