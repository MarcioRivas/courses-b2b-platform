"use client"

import { PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

export interface McOptionValue {
  label: string
  isCorrect: boolean
}

interface McOptionsEditorProps {
  options: McOptionValue[]
  onChange: (options: McOptionValue[]) => void
  error?: string
}

const MIN_OPTIONS = 2
const MAX_OPTIONS = 6

/** 2–6 options, exactly one correct via a single radio group (5A step 2). */
export function McOptionsEditor({ options, onChange, error }: McOptionsEditorProps) {
  const labels = teachAssessmentMessages.mcOptions
  const correctIndex = options.findIndex((o) => o.isCorrect)

  function updateLabel(index: number, label: string) {
    onChange(options.map((o, i) => (i === index ? { ...o, label } : o)))
  }

  function setCorrect(index: number) {
    onChange(options.map((o, i) => ({ ...o, isCorrect: i === index })))
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return
    onChange([...options, { label: "", isCorrect: options.length === 0 }])
  }

  function removeOption(index: number) {
    if (options.length <= MIN_OPTIONS) return
    onChange(options.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{labels.title}</span>
      <RadioGroup
        value={correctIndex >= 0 ? String(correctIndex) : undefined}
        onValueChange={(value) => setCorrect(Number(value))}
        className="flex flex-col gap-2"
      >
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <RadioGroupItem
              value={String(index)}
              aria-label={labels.correctLabel}
              title={labels.correctLabel}
            />
            <Input
              value={option.label}
              onChange={(e) => updateLabel(index, e.target.value)}
              placeholder={labels.labelPlaceholder}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={options.length <= MIN_OPTIONS}
              onClick={() => removeOption(index)}
              title={labels.removeOption}
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        ))}
      </RadioGroup>
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={options.length >= MAX_OPTIONS} onClick={addOption}>
        <PlusIcon className="size-4" /> {labels.addOption}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
