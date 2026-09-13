"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ActionResult } from "@/lib/errors"
import { heartbeat } from "../actions/heartbeat"
import { getOrCreateSessionId } from "../lib/answer-store"
import type { AttemptSync, HeartbeatResult } from "../types"

const HEARTBEAT_INTERVAL_MS = 30_000

interface UseAttemptSessionOptions {
  attemptId: string
  /** Called on every successful heartbeat so the timer and the status can resync. */
  onSync: (sync: AttemptSync) => void
}

function applyResult(
  result: ActionResult<HeartbeatResult>,
  setReadOnly: (value: boolean) => void,
  onSync: (sync: AttemptSync) => void
) {
  if (result.ok) {
    setReadOnly(false)
    onSync(result.data)
  } else if (result.code === "LOCKED") {
    setReadOnly(true)
  }
}

/**
 * Session lock lifecycle (D3): claims/refreshes on mount and every 30s,
 * releases on `pagehide` via the keepalive route (a Server Action cannot run
 * while the page is being torn down — D30). `SESSION_LOCKED` flips this tab
 * read-only until the student explicitly takes over.
 */
export function useAttemptSession({ attemptId, onSync }: UseAttemptSessionOptions) {
  const [sessionId] = useState(() => getOrCreateSessionId(attemptId))
  const [readOnly, setReadOnly] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const onSyncRef = useRef(onSync)

  useEffect(() => {
    onSyncRef.current = onSync
  }, [onSync])

  // The polling loop calls the RPC directly (rather than through a shared
  // `useCallback`) so the state updates only ever happen inside this effect's
  // own async continuation — calling out to a hoisted callback here reads as
  // a synchronous state update to the stricter react-hooks rules.
  useEffect(() => {
    let cancelled = false

    function poll(force: boolean) {
      heartbeat({ attemptId, sessionId, force }).then((result) => {
        if (!cancelled) {
          applyResult(result, setReadOnly, (sync) => onSyncRef.current(sync))
        }
      })
    }

    poll(false)
    const interval = setInterval(() => poll(false), HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [attemptId, sessionId])

  useEffect(() => {
    function onPageHide() {
      const body = JSON.stringify({ sessionId })
      fetch(`/api/attempts/${attemptId}/release`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {})
    }

    window.addEventListener("pagehide", onPageHide)
    return () => window.removeEventListener("pagehide", onPageHide)
  }, [attemptId, sessionId])

  // Used from click handlers (the session-locked dialog), never from an
  // effect, so a direct `heartbeat` call here carries none of the polling
  // loop's constraints above.
  const beat = useCallback(
    async (force: boolean): Promise<ActionResult<HeartbeatResult>> => {
      const result = await heartbeat({ attemptId, sessionId, force })
      applyResult(result, setReadOnly, (sync) => onSyncRef.current(sync))
      return result
    },
    [attemptId, sessionId]
  )

  // H2: a forced takeover reclaims the lock, but this tab's in-memory
  // `client_seq` counters and answer values are stale relative to whatever
  // the other tab saved before being displaced — a full reload re-fetches the
  // RSC snapshot (which reseeds the autosave counters from the server) while
  // `sessionStorage`'s session id survives, so the same session re-claims the
  // lock on the way back in rather than racing a second `start_attempt`.
  const takeOver = useCallback(async () => {
    setRetrying(true)
    const result = await beat(true)
    if (result.ok) {
      window.location.reload()
      return result
    }
    setRetrying(false)
    return result
  }, [beat])

  const retryHeartbeat = useCallback(async () => {
    setRetrying(true)
    const result = await beat(false)
    setRetrying(false)
    return result
  }, [beat])

  // M6: an autosave that comes back `LOCKED` (another tab just took over)
  // must flip this tab read-only immediately rather than waiting up to 30s
  // for the next heartbeat poll to notice.
  const markLocked = useCallback(() => setReadOnly(true), [])

  return { sessionId, readOnly, retrying, takeOver, retryHeartbeat, markLocked }
}
