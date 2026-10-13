"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

interface RandomCountFieldProps {
  /** NULL = every student gets every question. */
  value: number | null
  total: number
  onChange: (value: number | null) => void
}

/** "Show only N of them, at random" — drawn from this assessment's own questions. */
export function RandomCountField({ value, total, onChange }: RandomCountFieldProps) {
  const labels = teachAssessmentMessages.questionsEditor
  const enabled = value !== null
  const exceeds = enabled && value > total

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="random-count-toggle"
          checked={enabled}
          disabled={total < 2}
          onCheckedChange={(checked) => onChange(checked === true ? Math.max(1, total - 1) : null)}
        />
        <Label htmlFor="random-count-toggle" className="font-normal">
          {labels.randomToggle}
        </Label>
      </div>
      {enabled && (
        <div className="flex flex-wrap items-center gap-3 pl-6">
          <Label htmlFor="random-count" className="text-sm font-normal text-muted-foreground">
            {labels.randomCountLabel}
          </Label>
          <Input
            id="random-count"
            type="number"
            min="1"
            max={total}
            className="w-20"
            value={value}
            onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          <span className={exceeds ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {exceeds ? teachAssessmentMessages.errors.randomCountExceeds : labels.randomHint(total)}
          </span>
        </div>
      )}
    </div>
  )
}
