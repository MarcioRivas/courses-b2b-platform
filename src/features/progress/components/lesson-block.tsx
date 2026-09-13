import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckIcon } from "lucide-react"
import { learnMessages } from "@/lib/messages/learn"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { BlockRenderer } from "@/features/content-blocks/components/block-renderer"
import { OFFERABLE_BLOCK_TYPES, type OfferableBlockType } from "@/features/content-blocks/schemas/content-block-schemas"
import type { StudentBlock } from "@/features/enrollments/queries/get-enrollment-course-tree"
import { CompletionToggle } from "./completion-toggle"

interface LessonBlockProps {
  enrollmentId: string
  block: StudentBlock
}

function isOfferable(type: string): type is OfferableBlockType {
  return (OFFERABLE_BLOCK_TYPES as string[]).includes(type)
}

/**
 * QUIZ/TASK card: no manual toggle at all (D33) — `complete_content_block`
 * rejects those types server-side, and their `content_progress` row is
 * written by `finalize_attempt` once the linked assessment is passed/handed
 * in. Typed on the raw DB enum, not `OfferableBlockType`, because that union
 * only ever covers the five non-assessment block types (Phase 5 adds
 * `assessment_id`, not a new content-block schema variant).
 */
function AssessmentBlockCard({ enrollmentId, block }: LessonBlockProps) {
  if (!block.assessmentId || !block.assessment) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{learnAssessmentMessages.kind[block.assessment.kind]}</Badge>
        <span className="font-medium">{block.assessment.title}</span>
      </div>
      {block.completed ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckIcon className="size-4" /> {learnMessages.lesson.markedComplete}
        </span>
      ) : (
        <Button size="sm" className="self-start" render={<Link href={`/learn/assessments/${block.assessmentId}/start?enrollment=${enrollmentId}`} />}>
          {learnAssessmentMessages.preflight.startAction}
        </Button>
      )}
    </div>
  )
}

export function LessonBlock({ enrollmentId, block }: LessonBlockProps) {
  const isAssessment = block.type === "QUIZ" || block.type === "TASK"

  if (!isAssessment && !isOfferable(block.type)) {
    return null
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      {!block.isRequired && (
        <Badge variant="outline" className="self-start">
          {learnMessages.lesson.optionalBlock}
        </Badge>
      )}

      {isAssessment ? (
        <AssessmentBlockCard enrollmentId={enrollmentId} block={block} />
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
