"use client"

import { Fragment, useLayoutEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { dayKey, formatDayLabel, formatMessageClock } from "../lib/format-message-time"
import type { ThreadChange, ThreadMessage } from "../hooks/use-conversation-messages"

/** Within this many px of the bottom counts as "reading the latest", so new messages scroll in. */
const STICK_TO_BOTTOM_PX = 120

interface MessageListProps {
  messages: ThreadMessage[]
  currentUserId: string
  timeZone: string
  hasMore: boolean
  loadingOlder: boolean
  lastChange: ThreadChange
  onLoadOlder: () => void
  onRetry: (localId: string) => void
}

/** Scrollable thread: day separators, own messages on the right, plain text only (no HTML). */
export function MessageList({
  messages,
  currentUserId,
  timeZone,
  hasMore,
  loadingOlder,
  lastChange,
  onLoadOlder,
  onRetry,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const heightBefore = useRef(0)
  const wasNearBottom = useRef(true)

  // Runs before paint: keep the reader's place when older pages load, follow
  // new messages only when they were already at the bottom (or sent one).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const last = messages.at(-1)
    if (lastChange === "prepended") {
      el.scrollTop += el.scrollHeight - heightBefore.current
    } else if (lastChange === "initial" || wasNearBottom.current || last?.senderId === currentUserId) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, lastChange, currentUserId])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    heightBefore.current = el.scrollHeight
    wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
  }

  function loadOlder() {
    heightBefore.current = scrollRef.current?.scrollHeight ?? 0
    onLoadOlder()
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      {hasMore && (
        <div className="mb-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? t.thread.loadingOlder : t.thread.loadOlder}
          </Button>
        </div>
      )}
      {messages.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{t.thread.empty}</p>
      )}
      <ol className="flex flex-col gap-1.5">
        {messages.map((message, index) => {
          const mine = message.senderId === currentUserId
          const day = dayKey(message.createdAt, timeZone)
          const previous = messages[index - 1]
          const newDay = !previous || dayKey(previous.createdAt, timeZone) !== day

          return (
            <Fragment key={message.id}>
              {newDay && (
                <li className="my-3 flex justify-center" aria-hidden="true">
                  <span className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">
                    {formatDayLabel(message.createdAt, timeZone)}
                  </span>
                </li>
              )}
              <li
                className={cn(
                  "flex flex-col",
                  mine ? "items-end" : "items-start",
                  // Only a newly arrived message rises in; the initial page and older pages appear still.
                  lastChange === "appended" && index === messages.length - 1 && "animate-rise-in"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[70%]",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
                    message.status === "sending" && "opacity-70",
                    message.status === "failed" && "ring-2 ring-destructive/60"
                  )}
                >
                  {message.body}
                </div>
                <span className="mt-0.5 px-1 text-[11px] text-muted-foreground">
                  {message.status === "sending" ? (
                    t.thread.sending
                  ) : message.status === "failed" ? (
                    <>
                      {t.thread.failed}{" "}
                      <button type="button" className="font-medium text-destructive underline" onClick={() => onRetry(message.id)}>
                        {t.thread.retry}
                      </button>
                    </>
                  ) : (
                    <time dateTime={message.createdAt}>{formatMessageClock(message.createdAt, timeZone)}</time>
                  )}
                </span>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}
