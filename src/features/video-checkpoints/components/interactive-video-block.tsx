"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon } from "lucide-react"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { toggleBlockCompletion } from "@/features/progress/actions/toggle-block-completion"
import { CompletionToggle } from "@/features/progress/components/completion-toggle"
import { answerVideoCheckpoint } from "../actions/answer-video-checkpoint"
import { refreshLessonCheckpoints } from "../actions/refresh-lesson-checkpoints"
import { nextPending, segmentStart } from "../lib/checkpoint-gate"
import { Button } from "@/components/ui/button"
import type { CheckpointResult, StudentCheckpoint } from "../types"
import { CheckpointVideoPlayer, type SeekRequest } from "./checkpoint-video-player"
import { CheckpointQuizDialog } from "./checkpoint-quiz-dialog"
import { CheckpointProgressStrip } from "./checkpoint-progress-strip"

interface InteractiveVideoBlockProps {
  enrollmentId: string
  lessonId: string
  blockId: string
  videoId: string
  title?: string
  /** Optional blocks never count towards progress, so they are not auto-completed. */
  isRequired: boolean
  initialCompleted: boolean
  initialCheckpoints: StudentCheckpoint[]
}

/**
 * Student video block: pauses at each pending checkpoint, hides the player and
 * opens the full-screen quiz; completes the block automatically when the video
 * ends (all checkpoints passed — the server re-checks). If the video cannot be
 * embedded, falls back to the manual completion toggle.
 */
export function InteractiveVideoBlock(props: InteractiveVideoBlockProps) {
  const { enrollmentId, lessonId, blockId, videoId, title, isRequired } = props
  const copy = videoCheckpointMessages.student
  const router = useRouter()
  const [checkpoints, setCheckpoints] = useState(props.initialCheckpoints)
  const [completed, setCompleted] = useState(props.initialCompleted)
  const [openId, setOpenId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<CheckpointResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null)
  const [playerError, setPlayerError] = useState<"embed" | "load" | null>(null)
  const open = checkpoints.find((checkpoint) => checkpoint.id === openId) ?? null
  const pending = nextPending(checkpoints)

  function openQuiz(checkpointId: string) {
    setAnswers({})
    setResult(null)
    setOpenId(checkpointId)
  }

  function closeAndSeek(seconds: number) {
    setOpenId(null)
    setResult(null)
    setSeekRequest({ seconds, play: true, nonce: Date.now() })
  }

  async function submit() {
    if (!open) return
    setSubmitting(true)
    let response: Awaited<ReturnType<typeof answerVideoCheckpoint>>
    try {
      response = await answerVideoCheckpoint({
        enrollmentId,
        checkpointId: open.id,
        answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
      })
    } catch {
      toast.error(videoCheckpointMessages.errors.UNKNOWN)
      return
    } finally {
      setSubmitting(false)
    }
    if (!response.ok) {
      toast.error(response.message)
      // State may have drifted (e.g. the professor edited the checkpoints): resync.
      await retry()
      return
    }
    if (response.data.passed) {
      setCheckpoints((current) => current.map((c) => (c.id === open.id ? { ...c, passed: true } : c)))
      toast.success(copy.passed)
      closeAndSeek(open.atSeconds)
    } else {
      setResult(response.data)
    }
  }

  async function retry() {
    const refreshed = await refreshLessonCheckpoints({ enrollmentId, lessonId })
    if (refreshed.ok) setCheckpoints(refreshed.data[blockId] ?? checkpoints)
    setAnswers({})
    setResult(null)
  }

  async function handleEnded() {
    if (!isRequired || completed) return
    const response = await toggleBlockCompletion({ enrollmentId, blockId, completed: true })
    if (!response.ok) {
      toast.error(response.message)
      return
    }
    setCompleted(true)
    toast.success(copy.completed)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {checkpoints.length > 0 && <CheckpointProgressStrip checkpoints={checkpoints} />}

      {playerError ? (
        // The video cannot play here: link out to YouTube, let the student
        // answer the questions without the player, then complete manually.
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-3 text-sm">
          <p>{playerError === "embed" ? copy.embedError : copy.loadError}</p>
          <a
            className="w-fit underline"
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.watchOnYoutube}
          </a>
          {pending ? (
            <Button type="button" size="sm" className="self-start" onClick={() => openQuiz(pending.id)}>
              {copy.answerWithoutVideo}
            </Button>
          ) : (
            isRequired && <CompletionToggle enrollmentId={enrollmentId} blockId={blockId} initialCompleted={completed} />
          )}
        </div>
      ) : (
        <CheckpointVideoPlayer
          videoId={videoId}
          title={title}
          checkpoints={checkpoints}
          hidden={open !== null}
          seekRequest={seekRequest}
          onCheckpointReached={openQuiz}
          onEnded={handleEnded}
          onError={setPlayerError}
        />
      )}

      {completed && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckIcon className="size-4" /> {copy.completed}
        </span>
      )}

      <CheckpointQuizDialog
        checkpoint={open}
        answers={answers}
        result={result}
        submitting={submitting}
        onAnswer={(questionId, optionId) => setAnswers((current) => ({ ...current, [questionId]: optionId }))}
        onSubmit={submit}
        onRewatch={() => open && closeAndSeek(segmentStart(checkpoints, open.id))}
        onRetry={retry}
      />
    </div>
  )
}
