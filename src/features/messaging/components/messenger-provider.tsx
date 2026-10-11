"use client"

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react"
import { useChatDock } from "../hooks/use-chat-dock"
import { useMessengerInbox } from "../hooks/use-messenger-inbox"
import { ChatDock } from "./chat-dock"

type MessengerContextValue = ReturnType<typeof useMessengerInbox> &
  ReturnType<typeof useChatDock> & {
    currentUserId: string
    timeZone: string
    /** The header Chats button: focus returns here when a window closes or minimizes. */
    chatsButtonRef: RefObject<HTMLButtonElement | null>
    /** Unsent text per conversation, so minimizing (which unmounts the window) keeps it. */
    getDraft: (conversationId: string) => string
    setDraft: (conversationId: string, text: string) => void
  }

const MessengerContext = createContext<MessengerContextValue | null>(null)

export function useMessenger(): MessengerContextValue {
  const value = useContext(MessengerContext)
  if (!value) throw new Error("useMessenger must be used inside <MessengerProvider>")
  return value
}

interface MessengerProviderProps {
  currentUserId: string
  initialUnread: number
  /** Org timezone (C16) for message times. */
  timeZone: string
  children: ReactNode
}

/**
 * Lives in the role shell, so the inbox, the header badge, the open chat
 * windows and their drafts survive navigation between pages of the same area.
 */
export function MessengerProvider({ currentUserId, initialUnread, timeZone, children }: MessengerProviderProps) {
  const { conversations, unreadCount, failed, loadInbox, scheduleRefresh } = useMessengerInbox(
    currentUserId,
    initialUnread
  )
  const { openChats, minimizedChats, openChat, minimizeChat, closeChat } = useChatDock()
  const chatsButtonRef = useRef<HTMLButtonElement | null>(null)

  const drafts = useRef(new Map<string, string>())
  const getDraft = useCallback((id: string) => drafts.current.get(id) ?? "", [])
  const setDraft = useCallback((id: string, text: string) => {
    if (text) drafts.current.set(id, text)
    else drafts.current.delete(id)
  }, [])

  const value = useMemo(
    () => ({
      conversations,
      unreadCount,
      failed,
      loadInbox,
      scheduleRefresh,
      openChats,
      minimizedChats,
      openChat,
      minimizeChat,
      closeChat,
      currentUserId,
      timeZone,
      chatsButtonRef,
      getDraft,
      setDraft,
    }),
    [
      conversations,
      unreadCount,
      failed,
      loadInbox,
      scheduleRefresh,
      openChats,
      minimizedChats,
      openChat,
      minimizeChat,
      closeChat,
      currentUserId,
      timeZone,
      getDraft,
      setDraft,
    ]
  )

  return (
    <MessengerContext.Provider value={value}>
      {children}
      <ChatDock />
    </MessengerContext.Provider>
  )
}
