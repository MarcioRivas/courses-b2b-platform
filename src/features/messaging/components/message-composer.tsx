"use client"

import { useId, useState, type FormEvent, type KeyboardEvent } from "react"
import { SendHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { MAX_MESSAGE_LENGTH } from "../types"

/** Show the remaining-characters hint only near the limit. */
const COUNTER_THRESHOLD = 200

interface MessageComposerProps {
  disabled?: boolean
  /** Draft kept by the dock while the window was minimized. */
  initialValue?: string
  onDraftChange?: (text: string) => void
  onSend: (body: string) => void
}

/** Enter sends, Shift+Enter adds a line. The box clears immediately; failures show on the bubble. */
export function MessageComposer({ disabled = false, initialValue = "", onDraftChange, onSend }: MessageComposerProps) {
  // Unique per window: two chats can be open side by side.
  const composerId = useId()
  const [body, setBodyState] = useState(initialValue)
  const setBody = (text: string) => {
    setBodyState(text)
    onDraftChange?.(text)
  }
  const trimmed = body.trim()
  const remaining = MAX_MESSAGE_LENGTH - body.length

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (disabled || trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) return
    onSend(trimmed)
    setBody("")
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: don't send mid-IME composition (accents on some keyboards).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1 border-t bg-background p-2">
      <div className="flex items-end gap-2">
        <label htmlFor={composerId} className="sr-only">
          {t.composer.label}
        </label>
        <Textarea
          id={composerId}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.composer.placeholder}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled}
          // Opening a chat window puts the cursor in the box, as in Messenger.
          autoFocus
          rows={1}
          aria-describedby={`${composerId}-hint`}
          className="max-h-32 min-h-9 resize-none rounded-2xl bg-muted"
        />
        <Button type="submit" size="icon" disabled={disabled || trimmed.length === 0} aria-label={t.composer.send}>
          <SendHorizontalIcon />
        </Button>
      </div>
      <p id={`${composerId}-hint`} className="sr-only">
        {t.composer.hint}
      </p>
      {remaining <= COUNTER_THRESHOLD && (
        <p aria-live="polite" className="px-1 text-xs text-muted-foreground">
          {t.composer.remaining(remaining)}
        </p>
      )}
    </form>
  )
}
