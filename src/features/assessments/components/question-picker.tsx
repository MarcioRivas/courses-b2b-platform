"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared/empty-state"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { setAssessmentQuestions } from "../actions/set-assessment-questions"
import { RandomConfigField, type RandomConfigValue } from "./random-config-field"
import type { AssessmentBankOption } from "../queries/get-assessment-config"
import type { QuestionOptionForPicker } from "@/features/questions/types"
import type { AssessmentFixedQuestion } from "../types"

interface QuestionPickerProps {
  assessmentId: string
  availableQuestions: QuestionOptionForPicker[]
  banks: AssessmentBankOption[]
  initialFixed: AssessmentFixedQuestion[]
  initialRandomBankId: string | null
  initialRandomCount: number | null
}

interface FixedRow {
  questionId: string
  points: number
  prompt: string
}

/** Fixed question list + points, saved together with the random config in one `setAssessmentQuestions` call (5B step 3). */
export function QuestionPicker({
  assessmentId,
  availableQuestions,
  banks,
  initialFixed,
  initialRandomBankId,
  initialRandomCount,
}: QuestionPickerProps) {
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.assessments.questionPicker
  const [rows, setRows] = useState<FixedRow[]>(
    initialFixed.map((q) => ({ questionId: q.questionId, points: q.points, prompt: q.prompt }))
  )
  const [random, setRandom] = useState<RandomConfigValue>({ bankId: initialRandomBankId, count: initialRandomCount })

  const selectableQuestions = availableQuestions.filter((q) => !rows.some((r) => r.questionId === q.id))

  function addQuestion(question: QuestionOptionForPicker) {
    setRows([...rows, { questionId: question.id, points: question.defaultPoints, prompt: question.prompt }])
  }

  function removeQuestion(questionId: string) {
    setRows(rows.filter((r) => r.questionId !== questionId))
  }

  function updatePoints(questionId: string, points: number) {
    setRows(rows.map((r) => (r.questionId === questionId ? { ...r, points } : r)))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setAssessmentQuestions({
        assessmentId,
        fixedQuestions: rows.map((r) => ({ questionId: r.questionId, points: r.points })),
        randomBankId: random.bankId ?? undefined,
        randomCount: random.bankId ? (random.count ?? undefined) : undefined,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.saved)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{labels.title}</p>
        <p className="text-sm text-muted-foreground">{labels.description}</p>

        {rows.length === 0 ? (
          <EmptyState title={availableQuestions.length === 0 ? labels.emptyBanksTitle : labels.emptyFixedTitle} />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.questionId} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="flex-1">{row.prompt}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={row.points}
                  onChange={(e) => updatePoints(row.questionId, Number(e.target.value) || 0)}
                  className="w-24"
                  aria-label={labels.pointsLabel}
                />
                <Button variant="ghost" size="icon" onClick={() => removeQuestion(row.questionId)} title={labels.removeAction}>
                  <TrashIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {selectableQuestions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {selectableQuestions.map((question) => (
              <li key={question.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm">
                <span className="flex-1 truncate">
                  {question.prompt} <span className="text-xs text-muted-foreground">— {question.bankName}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => addQuestion(question)}>
                  <PlusIcon className="size-4" /> {labels.addAction}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RandomConfigField banks={banks} value={random} onChange={setRandom} />

      <Button type="button" onClick={handleSave} disabled={isPending} className="self-start">
        {isPending ? messages.common.loading : labels.saveAction}
      </Button>
    </div>
  )
}
