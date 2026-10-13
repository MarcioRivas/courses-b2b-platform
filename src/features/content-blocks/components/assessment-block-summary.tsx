import { AssessmentStatusBadge } from "@/features/assessments/components/assessment-status-badge"
import type { AssessmentStatus } from "@/features/assessments/types"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

interface AssessmentBlockSummaryProps {
  type: "QUIZ" | "TASK"
  assessment: { title: string; status: AssessmentStatus; questionCount: number }
}

/** Builder preview of a QUIZ/TASK block: its assessment's title, status and size. */
export function AssessmentBlockSummary({ type, assessment }: AssessmentBlockSummaryProps) {
  const points = teachAssessmentMessages.questionsEditor

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{assessment.title}</span>
      {type === "QUIZ" && (
        <span className="text-muted-foreground">
          {assessment.questionCount} {assessment.questionCount === 1 ? "pregunta" : "preguntas"}
        </span>
      )}
      <AssessmentStatusBadge status={assessment.status} />
      {type === "QUIZ" && assessment.questionCount === 0 && (
        <span className="w-full text-xs text-muted-foreground">{points.emptyTitle}</span>
      )}
    </div>
  )
}
