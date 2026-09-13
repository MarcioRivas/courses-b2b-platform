import { Badge } from "@/components/ui/badge"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { QuestionType } from "../types"

export function QuestionTypeBadge({ type }: { type: QuestionType }) {
  return <Badge variant={type === "MULTIPLE_CHOICE" ? "default" : "outline"}>{teachAssessmentMessages.questions.types[type]}</Badge>
}
