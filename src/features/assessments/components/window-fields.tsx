"use client"

import type { Control } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { UpdateAssessmentInput } from "../schemas/assessment-schemas"

interface WindowFieldsProps {
  control: Control<UpdateAssessmentInput>
  kind: UpdateAssessmentInput["kind"]
  /** PUBLISHED EXAM (M3): edit through "Extender ventana" instead. */
  disabled?: boolean
}

/**
 * Duration + availability window (5B step 3): hidden entirely for QUIZ
 * (D12 — untimed, no window); TASK has no duration and a required deadline;
 * EXAM requires everything (the schema's `superRefine` enforces that; this
 * only controls visibility and labels).
 */
export function WindowFields({ control, kind, disabled }: WindowFieldsProps) {
  const labels = teachAssessmentMessages.assessments
  const isTask = kind === "TASK"

  if (kind === "QUIZ") {
    return null
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {!isTask && (
        <FormField
          control={control}
          name="durationMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.durationLabel}</FormLabel>
              <FormControl>
                <Input type="number" min="1" disabled={disabled} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={control}
        name="availableFrom"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{labels.windowFromLabel}</FormLabel>
            <FormControl>
              <Input type="datetime-local" disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="availableUntil"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{isTask ? labels.task.deadlineLabel : labels.windowUntilLabel}</FormLabel>
            <FormControl>
              <Input type="datetime-local" disabled={disabled} {...field} />
            </FormControl>
            {isTask && <FormDescription>{labels.task.deadlineHint}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
