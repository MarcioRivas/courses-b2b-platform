import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { formatTimestamp } from "../lib/format-timestamp"
import type { StudentCheckpoint } from "../types"

/** "Preguntas del video: 1 de 3 superadas" plus one chip per checkpoint time. */
export function CheckpointProgressStrip({ checkpoints }: { checkpoints: StudentCheckpoint[] }) {
  const passed = checkpoints.filter((checkpoint) => checkpoint.passed).length

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{videoCheckpointMessages.student.progress(passed, checkpoints.length)}</span>
      {checkpoints.map((checkpoint) => (
        <span
          key={checkpoint.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums",
            checkpoint.passed && "border-success/40 bg-success-soft text-success"
          )}
        >
          {checkpoint.passed && <CheckIcon className="size-3" aria-hidden />}
          {formatTimestamp(checkpoint.atSeconds)}
        </span>
      ))}
    </div>
  )
}
