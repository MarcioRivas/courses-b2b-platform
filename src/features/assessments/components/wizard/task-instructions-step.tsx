"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

const INSTRUCTIONS_MAX = 10000

interface TaskInstructionsStepProps {
  initial: string
  isPending: boolean
  onDirtyChange: (dirty: boolean) => void
  /** Resolves to true when saved. */
  onSave: (instructions: string) => Promise<boolean>
  onBack: () => void
  onNext: () => void
}

/** Wizard step 2 for a TASK: what students have to do and hand in. */
export function TaskInstructionsStep({ initial, isPending, onDirtyChange, onSave, onBack, onNext }: TaskInstructionsStepProps) {
  const labels = teachAssessmentMessages.assessments.task
  const wizard = teachAssessmentMessages.wizard
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const isDirty = value !== saved
  const tooLong = value.length > INSTRUCTIONS_MAX

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  async function handleNext() {
    if (isDirty) {
      if (!(await onSave(value))) return
      setSaved(value)
    }
    onNext()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-instructions">{labels.instructionsLabel}</Label>
        <Textarea
          id="task-instructions"
          rows={12}
          autoFocus={!initial}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={labels.instructionsPlaceholder}
        />
        <p className="flex justify-between gap-2 text-sm text-muted-foreground">
          <span>{labels.instructionsHint}</span>
          <span className={tooLong ? "tabular-nums text-destructive" : "tabular-nums"}>
            {value.length}/{INSTRUCTIONS_MAX}
          </span>
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isPending}>
          {wizard.back}
        </Button>
        <Button type="button" onClick={handleNext} disabled={isPending || tooLong}>
          {isPending ? messages.common.loading : isDirty ? wizard.saveAndContinue : wizard.next}
        </Button>
      </div>
    </div>
  )
}
