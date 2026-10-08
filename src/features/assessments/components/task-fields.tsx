"use client"

import { useWatch, type Control } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { UpdateAssessmentInput } from "../schemas/assessment-schemas"

const INSTRUCTIONS_MAX = 10000

interface TaskFieldsProps {
  control: Control<UpdateAssessmentInput>
}

/**
 * TASK-only settings: the instruction text students read, how many files
 * they may upload, and whether late submissions are accepted. The deadline
 * lives in `WindowFields`, which TASK shares with EXAM.
 */
export function TaskFields({ control }: TaskFieldsProps) {
  const labels = teachAssessmentMessages.assessments.task
  const instructions = useWatch({ control, name: "instructions" }) ?? ""

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name="instructions"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{labels.instructionsLabel}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ""} rows={8} placeholder={labels.instructionsPlaceholder} />
            </FormControl>
            <FormDescription className="flex justify-between gap-2">
              <span>{labels.instructionsHint}</span>
              <span className="tabular-nums">
                {instructions.length}/{INSTRUCTIONS_MAX}
              </span>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="maxFiles"
        render={({ field }) => (
          <FormItem className="sm:max-w-xs">
            <FormLabel>{labels.maxFilesLabel}</FormLabel>
            <FormControl>
              <Input type="number" min="1" max="10" {...field} value={field.value ?? ""} />
            </FormControl>
            <FormDescription>{labels.filesHint}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="allowLateSubmissions"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-start gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <div className="flex flex-col gap-1">
                <FormLabel>{labels.allowLateLabel}</FormLabel>
                <FormDescription>{labels.allowLateHint}</FormDescription>
              </div>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
