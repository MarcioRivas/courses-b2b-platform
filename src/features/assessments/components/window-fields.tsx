"use client"

import type { Control } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentConfigInput } from "../schemas/assessment-schemas"

interface WindowFieldsProps {
  control: Control<AssessmentConfigInput>
  kind: AssessmentConfigInput["kind"]
  /** PUBLISHED EXAM (M3): edit through "Extender ventana" instead. */
  disabled?: boolean
}

/**
 * Duration + availability window (wizard step 1): hidden entirely for QUIZ
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
    // Top-aligned: the deadline's hint must not push the "from" field down.
    <div className={cn("grid grid-cols-1 items-start gap-4", isTask ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
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
