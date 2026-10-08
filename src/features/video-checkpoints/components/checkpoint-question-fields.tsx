"use client"

import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { newOption, setCorrectOption, type DraftQuestion } from "../lib/checkpoint-draft"

const MAX_OPTIONS = 6
const MIN_OPTIONS = 2

interface CheckpointQuestionFieldsProps {
  question: DraftQuestion
  index: number
  canRemove: boolean
  onChange: (question: DraftQuestion) => void
  onRemove: () => void
}

/** One multiple-choice question: prompt, 2–6 options, exactly one marked correct (radio). */
export function CheckpointQuestionFields({ question, index, canRemove, onChange, onRemove }: CheckpointQuestionFieldsProps) {
  const copy = videoCheckpointMessages.editor
  const radioName = `correct-${question.key}`

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-3">
      {/* The legend must be the fieldset's first child to name it. */}
      <legend className="float-left text-sm font-medium">{copy.questionLabel(index + 1)}</legend>
      {canRemove && (
        <Button type="button" variant="ghost" size="sm" className="self-end" onClick={onRemove}>
          {copy.removeQuestion}
        </Button>
      )}
      <Textarea
        aria-label={copy.questionLabel(index + 1)}
        rows={2}
        value={question.prompt}
        placeholder={copy.promptPlaceholder}
        onChange={(event) => onChange({ ...question, prompt: event.target.value })}
      />
      <ul className="flex flex-col gap-2">
        {question.options.map((option, optionIndex) => (
          <li key={option.key} className="flex items-center gap-2">
            <input
              type="radio"
              id={`${radioName}-${option.key}`}
              name={radioName}
              className="size-4 accent-primary"
              checked={option.isCorrect}
              onChange={() => onChange(setCorrectOption(question, option.key))}
            />
            <Label htmlFor={`${radioName}-${option.key}`} className="sr-only">
              {copy.correctOption}
            </Label>
            <Input
              aria-label={copy.optionPlaceholder(optionIndex + 1)}
              value={option.label}
              placeholder={copy.optionPlaceholder(optionIndex + 1)}
              onChange={(event) =>
                onChange({
                  ...question,
                  options: question.options.map((o) => (o.key === option.key ? { ...o, label: event.target.value } : o)),
                })
              }
            />
            {option.isCorrect && <span className="shrink-0 text-xs text-muted-foreground">{copy.correctOption}</span>}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy.removeOption}
              disabled={question.options.length <= MIN_OPTIONS}
              onClick={() => {
                const remaining = question.options.filter((o) => o.key !== option.key)
                // Keep exactly one correct option if the removed one was it.
                const fixed = option.isCorrect && remaining[0] ? setCorrectOption({ ...question, options: remaining }, remaining[0].key) : { ...question, options: remaining }
                onChange(fixed)
              }}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={question.options.length >= MAX_OPTIONS}
        onClick={() => onChange({ ...question, options: [...question.options, newOption()] })}
      >
        <PlusIcon /> {copy.addOption}
      </Button>
    </fieldset>
  )
}
