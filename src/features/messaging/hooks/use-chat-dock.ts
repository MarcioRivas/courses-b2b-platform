"use client"

import { useCallback, useState } from "react"

/** Chat windows open side by side at the bottom (desktop). More go to the bubble column. */
export const MAX_OPEN_CHATS = 2

export interface DockedChat {
  id: string
  /** Shown on the bubble even before the chat has messages (it is not in the inbox yet). */
  name: string
}

interface DockState {
  /** Open windows, oldest first (the newest sits next to the bubbles). */
  open: DockedChat[]
  /** Minimized chats shown as avatar bubbles, most recent first. */
  minimized: DockedChat[]
}

const without = (chats: DockedChat[], id: string) => chats.filter((chat) => chat.id !== id)

/** Facebook-style dock: which conversations are open as windows and which are minimized to bubbles. */
export function useChatDock() {
  const [dock, setDock] = useState<DockState>({ open: [], minimized: [] })

  /** Opens (or brings forward) a chat; past the limit the oldest window becomes a bubble. */
  const openChat = useCallback((chat: DockedChat) => {
    setDock(({ open, minimized }) => {
      const nextOpen = [...without(open, chat.id), chat]
      const overflow = nextOpen.slice(0, Math.max(0, nextOpen.length - MAX_OPEN_CHATS))
      return {
        open: nextOpen.slice(-MAX_OPEN_CHATS),
        minimized: [...overflow.reverse(), ...without(minimized, chat.id)],
      }
    })
  }, [])

  const minimizeChat = useCallback((id: string) => {
    setDock(({ open, minimized }) => {
      const chat = open.find((item) => item.id === id)
      return chat ? { open: without(open, id), minimized: [chat, ...without(minimized, id)] } : { open, minimized }
    })
  }, [])

  const closeChat = useCallback((id: string) => {
    setDock(({ open, minimized }) => ({ open: without(open, id), minimized: without(minimized, id) }))
  }, [])

  return { openChats: dock.open, minimizedChats: dock.minimized, openChat, minimizeChat, closeChat }
}
