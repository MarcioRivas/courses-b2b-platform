import Link from "next/link"
import type { CSSProperties } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckIcon } from "lucide-react"
import { learnMessages } from "@/lib/messages/learn"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { BlockRenderer } from "@/features/content-blocks/components/block-renderer"
import { OFFERABLE_BLOCK_TYPES, type OfferableBlockType } from "@/features/content-blocks/schemas/content-block-schemas"
import type { StudentBlock } from "@/features/enrollments/queries/get-enrollment-course-tree"
import { CompletionToggle } from "./completion-toggle"
import { InteractiveVideoBlock } from "@/features/video-checkpoints/components/interactive-video-block"
import type { StudentCheckpoint } from "@/features/video-checkpoints/types"

interface LessonBlockProps {
  enrollmentId: string
  block: StudentBlock
}

interface LessonBlockListItemProps extends LessonBlockProps {
  lessonId: string
  /** Position in the lesson, drives the one-time stagger on arrival (capped in CSS). */
  index: number
  /** In-video checkpoints of this block (YOUTUBE_VIDEO only). */
  checkpoints: StudentCheckpoint[]
}

function isOfferable(type: string): type is OfferableBlockType {
  return (OFFERABLE_BLOCK_TYPES as string[]).includes(type)
}

/**
 * QUIZ/TASK card: no manual toggle at all (D33) — `complete_content_block`
 * rejects those types server-side, and their `content_progress` row is
 * written by `finalize_attempt` once a QUIZ is passed, or by `submit_task`
 * once a TASK is handed in (a TASK stays reachable after that, to see or
 * replace the entrega and its grade). Typed on the raw DB enum, not `OfferableBlockType`, because that union
 * only ever covers the five non-assessment block types (Phase 5 adds
 * `assessment_id`, not a new content-block schema variant).
 */
function AssessmentBlockCard({ enrollmentId, block }: LessonBlockProps) {
  if (!block.assessmentId || !block.assessment) {
    return null
  }
  const isTask = block.assessment.kind === "TASK"

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{learnAssessmentMessages.kind[block.assessment.kind]}</Badge>
        <span className="font-medium">{block.assessment.title}</span>
      </div>
      {block.completed && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckIcon className="size-4" /> {learnMessages.lesson.markedComplete}
        </span>
      )}
      {(!block.completed || isTask) && (
        <Button
          size="sm"
          variant={block.completed ? "outline" : "default"}
          className="self-start"
          render={<Link href={`/learn/assessments/${block.assessmentId}/start?enrollment=${enrollmentId}`} />}
        >
          {isTask
            ? block.completed
              ? learnAssessmentMessages.preflight.viewSubmissionAction
              : learnAssessmentMessages.preflight.openTaskAction
            : learnAssessmentMessages.preflight.startAction}
        </Button>
      )}
    </div>
  )
}

export function LessonBlock({ enrollmentId, lessonId, index, block, checkpoints }: LessonBlockListItemProps) {
  const isAssessment = block.type === "QUIZ" || block.type === "TASK"

  if (!isAssessment && !isOfferable(block.type)) {
    return null
  }

  return (
    <li
      className="stagger-item flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card"
      style={{ "--stagger-index": index } as CSSProperties}
    >
      {!block.isRequired && (
        <Badge variant="outline" className="self-start">
          {learnMessages.lesson.optionalBlock}
        </Badge>
      )}

      {isAssessment ? (
        <AssessmentBlockCard enrollmentId={enrollmentId} block={block} />
      ) : block.type === "YOUTUBE_VIDEO" ? (
        // Every video uses the API player: it completes itself when it ends
        // and enforces in-video checkpoints when there are any.
        <InteractiveVideoBlock
          enrollmentId={enrollmentId}
          lessonId={lessonId}
          blockId={block.id}
          videoId={(block.data as { videoId: string }).videoId}
          title={(block.data as { title?: string }).title}
          isRequired={block.isRequired}
          initialCompleted={block.completed}
          initialCheckpoints={checkpoints}
        />
      ) : (
        <>
          <BlockRenderer block={{ id: block.id, type: block.type, data: block.data }} />

          {block.isRequired && (
            <CompletionToggle enrollmentId={enrollmentId} blockId={block.id} initialCompleted={block.completed} />
          )}
        </>
      )}
    </li>
  )
}
