"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleDotIcon, PencilLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import {
  moveDraft,
  newQuestionDraft,
  rebaseDrafts,
  toQuestionDraft,
  totalPoints,
  validateDrafts,
  type QuestionDraft,
} from "../../lib/question-draft"
import type { AssessmentQuestionInput } from "../../schemas/assessment-question-schemas"
import type { AssessmentEditorData, QuestionType } from "../../types"
import { QuestionCard } from "./question-card"
import { RandomCountField } from "./random-count-field"

interface QuestionsStepProps {
  data: AssessmentEditorData
  isPending: boolean
  onDirtyChange: (dirty: boolean) => void
  /** Resolves to the saved ids in display order, or null on failure. */
  onSave: (questions: AssessmentQuestionInput[], randomCount: number | null) => Promise<string[] | null>
  onBack: () => void
  onNext: () => void
}

/**
 * Wizard step 2 for QUIZ/EXAM: the questions, authored in place. Drafts live
 * locally and are saved in one call; only one card is open at a time.
 */
export function QuestionsStep({ data, isPending, onDirtyChange, onSave, onBack, onNext }: QuestionsStepProps) {
  const labels = teachAssessmentMessages.questionsEditor
  const wizard = teachAssessmentMessages.wizard
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() => data.questions.map(toQuestionDraft))
  const [randomCount, setRandomCount] = useState<number | null>(data.randomQuestionCount)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify([data.questions.map(toQuestionDraft), data.randomQuestionCount]))

  const isDirty = useMemo(() => JSON.stringify([drafts, randomCount]) !== savedSnapshot, [drafts, randomCount, savedSnapshot])
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  function add(type: QuestionType) {
    const draft = newQuestionDraft(type)
    setDrafts((current) => [...current, draft])
    setExpanded(draft.key)
  }

  function update(next: QuestionDraft) {
    setDrafts((current) => current.map((d) => (d.key === next.key ? next : d)))
    if (errors[next.key]) {
      setErrors((current) => {
        const rest = { ...current }
        delete rest[next.key]
        return rest
      })
    }
  }

  function remove(key: string) {
    setDrafts((current) => current.filter((d) => d.key !== key))
    if (expanded === key) setExpanded(null)
  }

  const randomExceeds = randomCount !== null && randomCount > drafts.length

  async function save(advance: boolean) {
    if (!isDirty) {
      if (advance) onNext()
      return
    }
    const result = validateDrafts(drafts)
    if (!result.ok) {
      setErrors(result.errors)
      setExpanded(Object.keys(result.errors)[0] ?? null)
      return
    }
    setErrors({})
    // Removing every question turns the random draw off with it.
    const count = drafts.length === 0 ? null : randomCount
    const ids = await onSave(result.payload, count)
    if (!ids) return
    const rebased = rebaseDrafts(drafts, ids)
    setDrafts(rebased)
    setRandomCount(count)
    setSavedSnapshot(JSON.stringify([rebased, count]))
    if (advance) onNext()
  }

  const addButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{labels.addLabel}:</span>
      <Button type="button" variant="outline" size="sm" onClick={() => add("MULTIPLE_CHOICE")}>
        <CircleDotIcon className="size-4" /> {labels.addMultipleChoice}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => add("OPEN_ENDED")}>
        <PencilLineIcon className="size-4" /> {labels.addOpenEnded}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{labels.intro}</p>

      {drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{labels.emptyTitle}</p>
          <Button type="button" onClick={() => add("MULTIPLE_CHOICE")}>
            {labels.addFirst}
          </Button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-2">
            {drafts.map((draft, index) => (
              <QuestionCard
                key={draft.key}
                draft={draft}
                index={index}
                total={drafts.length}
                expanded={expanded === draft.key}
                error={errors[draft.key]}
                onToggle={() => setExpanded((current) => (current === draft.key ? null : draft.key))}
                onChange={update}
                onMove={(direction) => setDrafts((current) => moveDraft(current, index, direction))}
                onRemove={() => remove(draft.key)}
              />
            ))}
          </ol>
          {addButtons}
          <RandomCountField value={randomCount} total={drafts.length} onChange={setRandomCount} />
        </>
      )}

      {Object.keys(errors).length > 0 && <p className="text-sm text-destructive">{labels.fixErrors}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <span className="text-sm text-muted-foreground">{labels.summary(drafts.length, totalPoints(drafts))}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
            {wizard.back}
          </Button>
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={isPending || !isDirty || randomExceeds}>
            {labels.saveAction}
          </Button>
          <Button type="button" onClick={() => save(true)} disabled={isPending || randomExceeds}>
            {isPending ? messages.common.loading : isDirty ? wizard.saveAndContinue : wizard.next}
          </Button>
        </div>
      </div>
    </div>
  )
}
