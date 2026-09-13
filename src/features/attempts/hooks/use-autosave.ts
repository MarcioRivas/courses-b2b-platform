"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AttemptQuestion, AttemptSync } from "../types"
import { saveAnswers } from "../actions/save-answers"
import { clearStoredAnswers, loadStoredAnswers, saveStoredAnswers } from "../lib/answer-store"
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_FORCE_FLUSH_MS,
  bumpDirty,
  raiseSeqCounters,
  reconcileAccepted,
  seedFromMirror,
  toAnswerPayload,
  type DirtyMap,
} from "../lib/dirty-map"
import { runSaveWithRetry } from "../lib/run-save-with-retry"
import { useKeepaliveFlush } from "./use-keepalive-flush"

export type SaveState = "idle" | "saving" | "saved" | "error"

export interface AnswerValue {
  selectedOptionId: string | null
  textAnswer: string | null
}

interface UseAutosaveOptions {
  attemptId: string
  sessionId: string
  initialQuestions: AttemptQuestion[]
  readOnly: boolean
  onSync: (sync: AttemptSync) => void
  /** M6: a `LOCKED` save result means another tab just took over — flip read-only immediately, don't wait for the next heartbeat. */
  onLocked?: () => void
}

/**
 * Dirty-map autosave (D4/D16/D30): debounced + force-flushed + flushed on
 * hide/pagehide, backed by the pure `dirty-map` module. The `sessionStorage`
 * mirror survives a reload; `client_seq` reconciliation is what makes a
 * retried/out-of-order save harmless. The retry loop lives in
 * `runSaveWithRetry` and the hide/pagehide flush in `useKeepaliveFlush`
 * (review N2) so this hook stays focused on state + the debounce/interval
 * scheduling.
 */
export function useAutosave({ attemptId, sessionId, initialQuestions, readOnly, onSync, onLocked }: UseAutosaveOptions) {
  // Read once, up front, as a plain local — never through a ref during render
  // (the stricter react-hooks rules disallow reading `.current` while
  // rendering, even from inside a lazy `useState` initializer).
  const [initialDirtyAnswers] = useState(() => loadStoredAnswers(attemptId))
  // H1: seed from `max(server, mirror)`, not the server snapshot alone — a
  // mirror seq higher than the server's (e.g. an un-reconciled keepalive
  // flush from before a reload) must not be reusable by the next edit.
  const [seeded] = useState(() => seedFromMirror(initialQuestions, initialDirtyAnswers))

  const seqCounters = useRef(seeded.seqCounters)
  const dirtyRef = useRef<DirtyMap>(seeded.dirty)
  const flushingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSyncRef = useRef(onSync)
  const onLockedRef = useRef(onLocked)

  useEffect(() => {
    onSyncRef.current = onSync
  }, [onSync])

  useEffect(() => {
    onLockedRef.current = onLocked
  }, [onLocked])

  const [values, setValues] = useState<Map<string, AnswerValue>>(() => seeded.values)

  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const flush = useCallback(async () => {
    if (readOnly || flushingRef.current || dirtyRef.current.size === 0) {
      return
    }
    flushingRef.current = true
    setSaveState("saving")

    // Snapshot both the payload and the seqs it was sent with — later edits
    // may bump `dirtyRef.current` further while this request is in flight,
    // and reconciliation must only clear what was actually sent (D4/H1).
    const sent = Array.from(dirtyRef.current.values())
    const payload = toAnswerPayload(dirtyRef.current)

    const result = await runSaveWithRetry(() => saveAnswers({ attemptId, sessionId, answers: payload }))

    if (result.ok) {
      dirtyRef.current = reconcileAccepted(dirtyRef.current, sent, result.data.accepted)
      seqCounters.current = raiseSeqCounters(seqCounters.current, result.data.accepted)
      saveStoredAnswers(attemptId, Array.from(dirtyRef.current.values()))
      onSyncRef.current({
        serverNow: result.data.serverNow,
        effectiveEndAt: result.data.effectiveEndAt,
        status: result.data.status,
      })
      setSaveState("saved")
      setLastSavedAt(new Date())
    } else {
      if (result.code === "LOCKED") {
        onLockedRef.current?.()
      }
      setSaveState("error")
    }
    flushingRef.current = false
  }, [attemptId, sessionId, readOnly])

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS)
  }, [flush])

  // Low item: an unmount mid-debounce (navigating away right after an edit)
  // must not fire a `saveAnswers` call against an unmounted component.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const setAnswer = useCallback(
    (attemptQuestionId: string, patch: { selectedOptionId?: string | null; textAnswer?: string | null }) => {
      if (readOnly) {
        return
      }

      const { map, seqCounters: nextCounters } = bumpDirty(dirtyRef.current, seqCounters.current, attemptQuestionId, patch)
      dirtyRef.current = map
      seqCounters.current = nextCounters
      saveStoredAnswers(attemptId, Array.from(map.values()))

      setValues((prev) => {
        const next = new Map(prev)
        const existing = next.get(attemptQuestionId) ?? { selectedOptionId: null, textAnswer: null }
        next.set(attemptQuestionId, {
          selectedOptionId: "selectedOptionId" in patch ? (patch.selectedOptionId ?? null) : existing.selectedOptionId,
          textAnswer: "textAnswer" in patch ? (patch.textAnswer ?? null) : existing.textAnswer,
        })
        return next
      })

      scheduleFlush()
    },
    [attemptId, readOnly, scheduleFlush]
  )

  // Hard flush every 10s while dirty, independent of the debounce.
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current.size > 0) {
        void flush()
      }
    }, AUTOSAVE_FORCE_FLUSH_MS)
    return () => clearInterval(interval)
  }, [flush])

  useKeepaliveFlush({ attemptId, sessionId, dirtyRef, seqCounters })

  const pendingPayload = useCallback(() => toAnswerPayload(dirtyRef.current), [])
  const isDirty = useCallback(() => dirtyRef.current.size > 0, [])
  const clearAfterSubmit = useCallback(() => {
    dirtyRef.current = new Map()
    clearStoredAnswers(attemptId)
  }, [attemptId])

  return { values, setAnswer, saveState, lastSavedAt, flush, pendingPayload, isDirty, clearAfterSubmit }
}
