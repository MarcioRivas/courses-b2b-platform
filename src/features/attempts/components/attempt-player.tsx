"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { submitAttempt } from "../actions/submit-attempt"
import { useAttemptSession } from "../hooks/use-attempt-session"
import { useAttemptTimer } from "../hooks/use-attempt-timer"
import { useAutosave } from "../hooks/use-autosave"
import { useOnlineStatus } from "../hooks/use-online-status"
import { countAnswered } from "../lib/count-answered"
import type { AttemptSnapshot, AttemptStatus } from "../types"
import { AttemptTimer } from "./attempt-timer"
import { OfflineBanner } from "./offline-banner"
import { QuestionCard } from "./question-card"
import { QuestionNav } from "./question-nav"
import { SaveIndicator } from "./save-indicator"
import { SessionLockedDialog } from "./session-locked-dialog"
import { SubmitDialog } from "./submit-dialog"

interface AttemptPlayerProps {
  attemptId: string
  initialSnapshot: AttemptSnapshot
}

/**
 * The one-page player (5D step 12): question cards with anchor nav, no server
 * pagination — an attempt snapshot is small by construction. Orchestrates the
 * three hooks and reloads the RSC shell (`router.refresh()`) the moment the
 * status stops being IN_PROGRESS, from whichever source noticed first
 * (heartbeat, autosave, or the client timer expiring).
 */
export function AttemptPlayer({ attemptId, initialSnapshot }: AttemptPlayerProps) {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [finalizing, setFinalizing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [expireError, setExpireError] = useState<string | null>(null)
  const finalizedRef = useRef(false)

  const handleStatusChange = useCallback(
    (status: AttemptStatus) => {
      if (status !== "IN_PROGRESS" && !finalizedRef.current) {
        finalizedRef.current = true
        setFinalizing(true)
        router.refresh()
      }
    },
    [router]
  )

  // `useAttemptTimer` needs a stable expiry callback before `handleExpire`
  // (which depends on `session`) exists — a ref breaks the cycle without
  // reading it during render (the callback below only fires from the timer's
  // own interval, never synchronously while this component renders).
  const handleExpireRef = useRef<() => void>(() => {})
  const timer = useAttemptTimer(initialSnapshot.header, () => handleExpireRef.current())

  const session = useAttemptSession({
    attemptId,
    onSync: (sync) => {
      timer.resync(sync)
      handleStatusChange(sync.status)
    },
  })

  const autosave = useAutosave({
    attemptId,
    sessionId: session.sessionId,
    initialQuestions: initialSnapshot.questions,
    readOnly: session.readOnly || finalizing,
    onSync: (sync) => {
      timer.resync(sync)
      handleStatusChange(sync.status)
    },
    onLocked: session.markLocked,
  })

  // M1: a failed expiry submit (transient error, or still inside the 5s
  // grace so the server hasn't finalized yet) must NOT latch `finalizedRef` —
  // that would strand the player disabled with no message and swallow every
  // later heartbeat/save status change. Show the error, keep the session's
  // heartbeat polling alive, and let `handleStatusChange` fire for real the
  // moment any sync (heartbeat or a later autosave) reports non-IN_PROGRESS.
  const handleExpire = useCallback(async () => {
    await autosave.flush()
    const result = await submitAttempt({
      attemptId,
      sessionId: session.sessionId,
      answers: autosave.pendingPayload(),
    })
    if (result.ok) {
      autosave.clearAfterSubmit()
      handleStatusChange(result.data.status)
    } else {
      setExpireError(result.message)
      toast.error(result.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, session.sessionId])

  useEffect(() => {
    handleExpireRef.current = () => void handleExpire()
  }, [handleExpire])

  // H3: a failed submit (SESSION_LOCKED / network / server error) must never
  // be silent — the dialog stays open (returns `false`) so the student sees
  // the error and can retry instead of walking away believing it went through.
  async function handleSubmit(): Promise<boolean> {
    setSubmitting(true)
    setSubmitError(null)
    await autosave.flush()
    const result = await submitAttempt({
      attemptId,
      sessionId: session.sessionId,
      answers: autosave.pendingPayload(),
    })
    setSubmitting(false)
    if (result.ok) {
      autosave.clearAfterSubmit()
      handleStatusChange(result.data.status)
      return true
    }
    setSubmitError(result.message)
    toast.error(result.message)
    return false
  }

  const answeredCount = useMemo(() => countAnswered(autosave.values), [autosave.values])

  const totalCount = initialSnapshot.questions.length
  const disabled = session.readOnly || finalizing

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 py-3 backdrop-blur">
        <span className="text-sm font-medium">
          {learnAssessmentMessages.player.progressLabel(answeredCount, totalCount)}
        </span>
        <div className="flex items-center gap-3">
          <SaveIndicator state={autosave.saveState} lastSavedAt={autosave.lastSavedAt} />
          <AttemptTimer remainingMs={timer.remainingMs} warningLevel={timer.warningLevel} />
        </div>
      </div>

      <OfflineBanner isOnline={isOnline} />

      {expireError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {expireError}
        </p>
      )}

      <QuestionNav
        questions={initialSnapshot.questions}
        values={autosave.values}
        answeredCount={answeredCount}
        totalCount={totalCount}
      />

      <ol className="flex flex-col gap-4">
        {initialSnapshot.questions.map((question) => (
          <li key={question.attemptQuestionId}>
            <QuestionCard
              question={question}
              value={autosave.values.get(question.attemptQuestionId)}
              disabled={disabled}
              showCorrectness={false}
              onChange={(patch) => autosave.setAnswer(question.attemptQuestionId, patch)}
            />
          </li>
        ))}
      </ol>

      <div className="flex justify-end">
        <SubmitDialog
          unansweredCount={totalCount - answeredCount}
          disabled={disabled}
          submitting={submitting}
          errorMessage={submitError}
          onConfirm={handleSubmit}
        />
      </div>

      <SessionLockedDialog
        open={session.readOnly}
        retrying={session.retrying}
        onTakeOver={() => void session.takeOver()}
        onRetry={() => void session.retryHeartbeat()}
      />
    </div>
  )
}
