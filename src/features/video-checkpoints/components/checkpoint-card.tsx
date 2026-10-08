"use client"

import { useState } from "react"
import { PlayIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { formatTimestamp, parseTimestamp } from "../lib/format-timestamp"
import { newQuestion, type DraftCheckpoint } from "../lib/checkpoint-draft"
import { CheckpointQuestionFields } from "./checkpoint-question-fields"

const MAX_QUESTIONS = 5

interface CheckpointCardProps {
  checkpoint: DraftCheckpoint
  /** Video length when known, to reject times past the end. */
  durationSeconds: number | null
  takenTimes: number[]
  onChange: (checkpoint: DraftCheckpoint) => void
  onRemove: () => void
  onGoTo: (seconds: number) => void
  /** Reports whether the typed time is valid, so the editor can block saving. */
  onTimeValidityChange: (valid: boolean) => void
}

/** One checkpoint: time (mm:ss), required correct answers, and its 1–5 questions. */
export function CheckpointCard({
  checkpoint,
  durationSeconds,
  takenTimes,
  onChange,
  onRemove,
  onGoTo,
  onTimeValidityChange,
}: CheckpointCardProps) {
  const copy = videoCheckpointMessages.editor
  const [timeText, setTimeText] = useState(formatTimestamp(checkpoint.atSeconds))
  const [timeError, setTimeError] = useState<string | null>(null)
  const questionCount = checkpoint.questions.length

  function commitTime() {
    const seconds = parseTimestamp(timeText)
    const validation = videoCheckpointMessages.validation
    const error =
      seconds === null || seconds < 1
        ? validation.timeFormat
        : takenTimes.includes(seconds)
          ? validation.timeDuplicate
          : durationSeconds !== null && seconds >= durationSeconds
            ? validation.timeAfterEnd
            : null
    setTimeError(error)
    onTimeValidityChange(error === null)
    if (error === null && seconds !== null) {
      onChange({ ...checkpoint, atSeconds: seconds })
      setTimeText(formatTimestamp(seconds))
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`time-${checkpoint.key}`}>{copy.timeLabel}</Label>
          <Input
            id={`time-${checkpoint.key}`}
            className="w-28"
            value={timeText}
            onChange={(event) => setTimeText(event.target.value)}
            onBlur={commitTime}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onGoTo(checkpoint.atSeconds)}>
          <PlayIcon /> {copy.goToTime}
        </Button>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`min-${checkpoint.key}`}>{copy.minCorrectLabel}</Label>
          <select
            id={`min-${checkpoint.key}`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={Math.min(checkpoint.minCorrect, questionCount)}
            onChange={(event) => onChange({ ...checkpoint, minCorrect: Number(event.target.value) })}
          >
            {Array.from({ length: questionCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {copy.minCorrectOption(n, questionCount)}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={onRemove}>
          {copy.removeCheckpoint}
        </Button>
      </div>
      {timeError && <p className="text-sm text-destructive">{timeError}</p>}
      {checkpoint.id && <p className="text-xs text-muted-foreground">{copy.removeSavedWarning}</p>}

      <div className="flex flex-col gap-3">
        {checkpoint.questions.map((question, index) => (
          <CheckpointQuestionFields
            key={question.key}
            question={question}
            index={index}
            canRemove={questionCount > 1}
            onChange={(updated) =>
              onChange({ ...checkpoint, questions: checkpoint.questions.map((q) => (q.key === question.key ? updated : q)) })
            }
            onRemove={() => onChange({ ...checkpoint, questions: checkpoint.questions.filter((q) => q.key !== question.key) })}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={questionCount >= MAX_QUESTIONS}
        onClick={() => onChange({ ...checkpoint, questions: [...checkpoint.questions, newQuestion()] })}
      >
        <PlusIcon /> {copy.addQuestion}
      </Button>
    </li>
  )
}
