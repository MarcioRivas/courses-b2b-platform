"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import type { AttemptQuestionOption } from "../types"

interface McAnswerProps {
  questionId: string
  /** Id of the question prompt `<p>` in `question-card.tsx` — gives the group an accessible name. */
  promptId: string
  options: AttemptQuestionOption[]
  value: string | null
  disabled?: boolean
  onChange: (optionId: string) => void
}

/** Single-choice radio group — one correct option per question (5A). */
export function McAnswer({ questionId, promptId, options, value, disabled, onChange }: McAnswerProps) {
  return (
    <RadioGroup
      aria-labelledby={promptId}
      value={value ?? undefined}
      onValueChange={(next) => onChange(String(next))}
      disabled={disabled}
    >
      {options.map((option, index) => {
        const inputId = `${questionId}-option-${index}`
        return (
          <div key={option.id} className="flex items-center gap-2">
            <RadioGroupItem id={inputId} value={option.id} />
            <Label htmlFor={inputId} className="font-normal">
              {option.label}
            </Label>
          </div>
        )
      })}
    </RadioGroup>
  )
}
