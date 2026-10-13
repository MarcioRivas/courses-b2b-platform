"use client"

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { changeDraftType, type QuestionDraft } from "../../lib/question-draft"
import type { QuestionType } from "../../types"
import { McOptionsEditor } from "../questions/mc-options-editor"
import { QuestionTypeBadge } from "../questions/question-type-badge"

interface QuestionCardProps {
  draft: QuestionDraft
  index: number
  total: number
  expanded: boolean
  error?: string
  onToggle: () => void
  onChange: (draft: QuestionDraft) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

const TYPES: QuestionType[] = ["MULTIPLE_CHOICE", "OPEN_ENDED"]

/**
 * One question in the questions step. Collapsed it is a single summary line,
 * so a long quiz stays scannable; expanded it shows the editing fields. Only
 * one card is expanded at a time (the parent owns that).
 */
export function QuestionCard({ draft, index, total, expanded, error, onToggle, onChange, onMove, onRemove }: QuestionCardProps) {
  const labels = teachAssessmentMessages.questionsEditor
  const fieldId = `question-${draft.key}`

  return (
    <li className={cn("rounded-lg border bg-card", error && "border-destructive", expanded && "shadow-sm")}>
      <div className="flex items-center gap-2 p-2 pl-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{index + 1}.</span>
          <span className={cn("min-w-0 flex-1 truncate text-sm", !draft.prompt.trim() && "italic text-muted-foreground")}>
            {draft.prompt.trim() || labels.untitled}
          </span>
          <span className="hidden shrink-0 sm:inline-flex">
            <QuestionTypeBadge type={draft.type} />
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{labels.pointsShort(draft.points || "0")}</span>
          <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)} title={labels.moveUp}>
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={index === total - 1} onClick={() => onMove(1)} title={labels.moveDown}>
            <ArrowDownIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} title={labels.remove}>
            <TrashIcon className="size-4" />
          </Button>
        </div>
      </div>

      {error && !expanded && <p className="px-3 pb-2 text-sm text-destructive">{error}</p>}

      {expanded && (
        <div className="flex flex-col gap-4 border-t p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{labels.typeLabel}</span>
              <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={labels.typeLabel}>
                {TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={draft.type === type}
                    onClick={() => onChange(changeDraftType(draft, type))}
                    className={cn(
                      "rounded px-3 py-1 text-sm transition-colors",
                      draft.type === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {teachAssessmentMessages.questions.types[type]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex w-24 flex-col gap-2">
              <Label htmlFor={`${fieldId}-points`}>{labels.pointsLabel}</Label>
              <Input
                id={`${fieldId}-points`}
                type="number"
                min="0.5"
                step="0.5"
                value={draft.points}
                onChange={(e) => onChange({ ...draft, points: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-prompt`}>{labels.promptLabel}</Label>
            <Textarea
              id={`${fieldId}-prompt`}
              rows={3}
              autoFocus={!draft.prompt}
              value={draft.prompt}
              onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
            />
          </div>

          {draft.type === "MULTIPLE_CHOICE" && (
            <McOptionsEditor options={draft.options} onChange={(options) => onChange({ ...draft, options })} />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="button" variant="outline" size="sm" className="self-end" onClick={onToggle}>
            {labels.collapse}
          </Button>
        </div>
      )}
    </li>
  )
}
