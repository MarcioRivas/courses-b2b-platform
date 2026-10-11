import type { Database } from "@/types/database.types"

export type MemberRole = Database["public"]["Enums"]["membership_role"]

/** One row of the inbox (also the thread header, via `my_conversations(p_conversation)`). */
export interface ConversationSummary {
  id: string
  otherUserId: string
  otherName: string
  /** Null when the other member left the org (membership row gone). */
  otherRole: MemberRole | null
  otherIsActive: boolean
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  lastMessageAt: string | null
  unreadCount: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export interface MessageableMember {
  userId: string
  name: string
  role: MemberRole
}

/** Messages per page in a thread (initial load and "load older"). */
export const MESSAGES_PAGE_SIZE = 50

/** Matches the `messages.body` CHECK in the migration. */
export const MAX_MESSAGE_LENGTH = 4000
