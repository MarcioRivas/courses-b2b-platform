"use client"

import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { fetchConversation, type MessagesPage } from "../lib/messaging-reads"
import { settleAction } from "../lib/settle-action"
import type { DockedChat } from "../hooks/use-chat-dock"
import type { ConversationSummary } from "../types"
import { ChatWindowHeader } from "./chat-window-header"
import { ConversationThread } from "./conversation-thread"

interface ChatWindowProps {
  chat: DockedChat
  isDesktop: boolean
  onMinimize: () => void
  onClose: () => void
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; conversation: ConversationSummary; page: MessagesPage }

/** A docked window (full screen on mobile): loads the conversation, then hands off to the live thread. */
export function ChatWindow({ chat, isDesktop, onMinimize, onClose }: ChatWindowProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void settleAction(() => fetchConversation(chat.id)).then((result) => {
      if (cancelled) return
      setState(result.ok ? { status: "ready", ...result.data } : { status: "error", message: result.message })
    })
    return () => {
      cancelled = true
    }
  }, [chat.id, attempt])

  const retry = useCallback(() => {
    setState({ status: "loading" })
    setAttempt((value) => value + 1)
  }, [])

  // Escape minimizes to a bubble on desktop; on mobile (no bubbles) it closes.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    event.stopPropagation()
    if (isDesktop) onMinimize()
    else onClose()
  }

  return (
    <section
      aria-label={t.dock.window(chat.name)}
      onKeyDown={onKeyDown}
      className="flex h-dvh w-full flex-col overflow-hidden bg-background md:h-112 md:w-84 md:rounded-t-xl md:shadow-2xl md:ring-1 md:ring-foreground/10"
    >
      {state.status === "ready" ? (
        <ConversationThread
          conversation={state.conversation}
          initialMessages={state.page.messages}
          initialHasMore={state.page.hasMore}
          onMinimize={onMinimize}
          onClose={onClose}
        />
      ) : (
        <>
          <ChatWindowHeader name={chat.name} subtitle={null} onMinimize={onMinimize} onClose={onClose} />
          {state.status === "error" ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-4 text-sm text-muted-foreground">
              <p>{state.message}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                {t.thread.retry}
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
              <Skeleton className="h-8 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" />
              <Skeleton className="h-8 w-3/5 rounded-2xl" />
            </div>
          )}
        </>
      )}
    </section>
  )
}
