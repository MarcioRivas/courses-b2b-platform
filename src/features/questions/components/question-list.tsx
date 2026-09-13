"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { setQuestionActive } from "../actions/set-question-active"
import { QuestionForm } from "./question-form"
import { QuestionTypeBadge } from "./question-type-badge"
import type { QuestionDetail } from "../types"

interface QuestionListProps {
  questionBankId: string
  questions: QuestionDetail[]
}

export function QuestionList({ questionBankId, questions }: QuestionListProps) {
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.questions

  function toggleActive(questionId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setQuestionActive({ questionId, isActive: !isActive })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(isActive ? labels.deactivated : labels.reactivated)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{labels.title}</h2>
        <QuestionForm mode="create" questionBankId={questionBankId} trigger={<Button size="sm"><PlusIcon className="size-4" /> {labels.addAction}</Button>} />
      </div>

      {questions.length === 0 ? (
        <EmptyState title={labels.emptyTitle} />
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((question) => (
            <li key={question.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <QuestionTypeBadge type={question.type} />
                    <Badge variant={question.isActive ? "secondary" : "outline"}>
                      {question.isActive ? labels.activeLabel : labels.inactiveLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {question.defaultPoints} {labels.pointsLabel.toLowerCase()}
                    </span>
                  </div>
                  <p>{question.prompt}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <QuestionForm
                    mode="edit"
                    questionBankId={questionBankId}
                    question={question}
                    trigger={<Button variant="ghost" size="icon" title="Editar"><PencilIcon className="size-4" /></Button>}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => toggleActive(question.id, question.isActive)}
                  >
                    {question.isActive ? labels.deactivateAction : labels.reactivateAction}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
