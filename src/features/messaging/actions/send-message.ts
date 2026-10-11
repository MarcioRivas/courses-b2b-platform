"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { sendMessageSchema, type SendMessageInput } from "../schemas/messaging-schemas"
import { messagingRpcErrorResult } from "../lib/messaging-errors"
import { MESSAGING_ROLES } from "../lib/messaging-roles"
import type { ChatMessage } from "../types"

/**
 * Sends a text message, idempotent on the client-generated id (safe to
 * retry). No revalidation: the sender appends it locally and the other
 * participant receives it through Realtime.
 */
export async function sendMessage(input: SendMessageInput): Promise<ActionResult<ChatMessage>> {
  const parsed = sendMessageSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(MESSAGING_ROLES)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("send_message", {
    p_conversation: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_client_id: parsed.data.clientId,
  })

  const row = data?.[0]
  if (error || !row) {
    return messagingRpcErrorResult(error)
  }

  return {
    ok: true,
    data: {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
    },
  }
}
