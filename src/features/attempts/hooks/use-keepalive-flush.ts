"use client"

import { useEffect } from "react"
import type { RefObject } from "react"
import { raiseSeqCounters, reconcileAccepted, toAnswerPayload, type DirtyMap } from "../lib/dirty-map"
import { saveStoredAnswers } from "../lib/answer-store"
import type { AcceptedAnswer } from "../types"

interface UseKeepaliveFlushOptions {
  attemptId: string
  sessionId: string
  dirtyRef: RefObject<DirtyMap>
  seqCounters: RefObject<Map<string, number>>
}

/**
 * Immediate flush on hide/pagehide through the keepalive Route Handler
 * (review N2, extracted from `useAutosave`) — a Server Action cannot run
 * while the page is being torn down (D30). On a mere tab switch
 * (`visibilitychange`) the page stays alive, so the response is reconciled
 * exactly like a normal flush (H1) — otherwise this entry never leaves the
 * dirty map and every subsequent 10s force-flush resends the same no-op
 * write for the rest of the attempt.
 */
export function useKeepaliveFlush({ attemptId, sessionId, dirtyRef, seqCounters }: UseKeepaliveFlushOptions) {
  useEffect(() => {
    function flushKeepalive() {
      if (dirtyRef.current.size === 0) {
        return
      }
      const sent = Array.from(dirtyRef.current.values())
      const body = JSON.stringify({ sessionId, answers: toAnswerPayload(dirtyRef.current) })
      fetch(`/api/attempts/${attemptId}/answers`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((response) => (response.ok ? (response.json() as Promise<{ accepted?: unknown }>) : null))
        .then((data) => {
          const accepted = Array.isArray(data?.accepted) ? (data.accepted as AcceptedAnswer[]) : null
          if (!accepted) {
            return
          }
          dirtyRef.current = reconcileAccepted(dirtyRef.current, sent, accepted)
          seqCounters.current = raiseSeqCounters(seqCounters.current, accepted)
          saveStoredAnswers(attemptId, Array.from(dirtyRef.current.values()))
        })
        .catch(() => {})
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushKeepalive()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", flushKeepalive)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pagehide", flushKeepalive)
    }
  }, [attemptId, sessionId, dirtyRef, seqCounters])
}
