"use client"

import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { listAssessmentsForBlock } from "@/features/assessments/actions/list-assessments-for-block"
import type { AssessmentPickerOption } from "@/features/assessments/types"
import type { AssessmentBlockData } from "../lib/block-editor-types"

interface AssessmentBlockEditorProps {
  courseId: string
  kind: "QUIZ" | "TASK"
  value: AssessmentBlockData
  onChange: (value: AssessmentBlockData) => void
  errors: Record<string, string>
}

/**
 * Picks an existing QUIZ/TASK assessment of this course (5B step 3 deviation,
 * documented in the phase report): the assessment itself is authored on
 * `/teach/courses/[courseId]/assessments`, not inline here — creating a full
 * question/config flow inside the block editor would duplicate that surface.
 */
export function AssessmentBlockEditor({ courseId, kind, value, onChange, errors }: AssessmentBlockEditorProps) {
  const [options, setOptions] = useState<AssessmentPickerOption[] | null>(null)
  const labels = teachAssessmentMessages.block
  const pickerId = useId()

  useEffect(() => {
    let cancelled = false
    listAssessmentsForBlock(courseId, kind)
      .then((result) => {
        if (!cancelled) setOptions(result)
      })
      .catch(() => {
        if (!cancelled) toast.error(messages.errors.INTERNAL)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, kind])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={pickerId}>{labels.pickerTitle}</Label>
      {options && options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.pickerEmpty}</p>
      ) : (
        <Select value={value.assessmentId || undefined} onValueChange={(assessmentId) => onChange({ assessmentId: assessmentId ?? "" })}>
          <SelectTrigger id={pickerId} className="w-full">
            <SelectValue placeholder={labels.pickerPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {(options ?? []).map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-xs text-muted-foreground">{labels.pickerHelp}</p>
      {errors.assessmentId && <p className="text-sm text-destructive">{errors.assessmentId}</p>}
    </div>
  )
}
