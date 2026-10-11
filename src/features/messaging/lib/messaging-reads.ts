"use client"

import { createClient } from "@/lib/supabase/client"
import type { ActionResult } from "@/lib/errors"
import type { Database } from "@/types/database.types"
import { loadMessagesSchema, searchMembersSchema, type MessageCursor } from "../schemas/messaging-schemas"
import { messagingRpcErrorResult } from "./messaging-errors"
import { MESSAGES_PAGE_SIZE, type ChatMessage, type ConversationSummary, type MessageableMember } from "../types"

/**
 * Read paths, called straight from the browser with the user's session. They
 * need no Server Action: every row is already guarded in the database (the
 * participant-only `messages_select` RLS and the SECURITY DEFINER RPCs), and
 * Server Actions from one client run one at a time, so a slow inbox refresh
 * would otherwise hold back a send. Writes stay Server Actions.
 */

type ConversationRow = Database["public"]["Functions"]["my_conversations"]["Returns"][number]
type MessageRow = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }

export interface MessagesPage {
  /** Oldest first, ready to render. */
  messages: ChatMessage[]
  hasMore: boolean
}

/** Catch-up after a (re)subscribe: generous, a thread rarely gets more while disconnected. */
const NEWER_LIMIT = 200
const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, created_at"

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.conversation_id,
    otherUserId: row.other_user_id,
    otherName: `${row.other_first_name} ${row.other_last_name}`.trim(),
    otherRole: row.other_role,
    otherIsActive: row.other_is_active,
    lastMessageBody: row.last_message_body,
    lastMessageSenderId: row.last_message_sender_id,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
  }
}

function toMessage(row: MessageRow): ChatMessage {
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at }
}

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data })

/** The caller's conversations with at least one message, newest first. */
export async function fetchInbox(): Promise<ActionResult<ConversationSummary[]>> {
  const { data, error } = await createClient().rpc("my_conversations", {})
  return error ? messagingRpcErrorResult(error) : ok((data ?? []).map(toSummary))
}

/** Unread total for the header badge, without loading the whole inbox. */
export async function fetchUnreadCount(): Promise<ActionResult<number>> {
  const { data, error } = await createClient().rpc("my_unread_message_count")
  return error ? messagingRpcErrorResult(error) : ok(data ?? 0)
}

/**
 * A page of a thread. "older" pages back from the cursor on the (created_at, id)
 * pair (the index order, so messages sharing a timestamp are never skipped);
 * "newer" returns everything from the cursor on (catch-up; callers dedupe by id).
 * The cursor is schema-validated (ISO timestamp, uuid) before it reaches the filter.
 */
export async function fetchMessages(
  conversationId: string,
  direction?: "older" | "newer",
  cursor?: MessageCursor
): Promise<ActionResult<MessagesPage>> {
  if (direction && cursor && !loadMessagesSchema.safeParse({ conversationId, direction, cursor }).success) {
    return messagingRpcErrorResult({ message: "INVALID_CURSOR" })
  }

  const base = createClient().from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversationId)

  if (direction === "newer" && cursor) {
    const { data, error } = await base
      .gte("created_at", cursor.createdAt)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(NEWER_LIMIT)
    return error ? messagingRpcErrorResult(error) : ok({ messages: (data ?? []).map(toMessage), hasMore: false })
  }

  let query = base.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(MESSAGES_PAGE_SIZE + 1)
  if (direction === "older" && cursor) {
    query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`)
  }

  const { data, error } = await query
  if (error) return messagingRpcErrorResult(error)
  const rows = data ?? []
  return ok({
    hasMore: rows.length > MESSAGES_PAGE_SIZE,
    messages: rows.slice(0, MESSAGES_PAGE_SIZE).reverse().map(toMessage),
  })
}

/**
 * Header + latest page for a chat window. A conversation the caller may not
 * read (other org, not a participant) comes back empty: NOT_FOUND, like a missing one.
 */
export async function fetchConversation(
  conversationId: string
): Promise<ActionResult<{ conversation: ConversationSummary; page: MessagesPage }>> {
  const { data, error } = await createClient().rpc("my_conversations", { p_conversation: conversationId })
  const row = data?.[0]
  if (error || !row) return messagingRpcErrorResult(error ?? { code: "42501" })

  const page = await fetchMessages(conversationId)
  return page.ok ? ok({ conversation: toSummary(row), page: page.data }) : page
}

/** ACTIVE members of the caller's own org matching `query` (≥ 2 chars). */
export async function searchMembers(query: string): Promise<ActionResult<MessageableMember[]>> {
  const parsed = searchMembersSchema.safeParse({ query })
  if (!parsed.success) return ok([])

  const { data, error } = await createClient().rpc("search_messageable_members", { p_q: parsed.data.query })
  if (error) return messagingRpcErrorResult(error)
  return ok(
    (data ?? []).map((row) => ({ userId: row.user_id, name: `${row.first_name} ${row.last_name}`.trim(), role: row.role }))
  )
}
