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
          // The whole row is the label: a bigger target, and the chosen answer reads
          // at a glance (border + tint, 150ms) — kept quiet, this is exam UI.
          <Label
            key={option.id}
            htmlFor={inputId}
            className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 leading-snug font-normal transition-[background-color,border-color] duration-150 ease-out-quint hover:bg-muted/60 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5 has-disabled:cursor-default has-disabled:hover:bg-transparent"
          >
            <RadioGroupItem id={inputId} value={option.id} />
            <span>{option.label}</span>
          </Label>
        )
      })}
    </RadioGroup>
  )
}
