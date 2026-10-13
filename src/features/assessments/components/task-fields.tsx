"use client"

import type { Control } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentConfigInput } from "../schemas/assessment-schemas"

interface TaskFieldProps {
  control: Control<AssessmentConfigInput>
}

/**
 * TASK-only delivery settings (wizard step 1), split so the config step can
 * lay them out in its grid: how many files students may upload, and whether
 * late submissions are accepted. The deadline lives in `WindowFields`; the
 * instruction text is wizard step 2.
 */
export function MaxFilesField({ control }: TaskFieldProps) {
  const labels = teachAssessmentMessages.assessments.task

  return (
    <FormField
      control={control}
      name="maxFiles"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{labels.maxFilesLabel}</FormLabel>
          <FormControl>
            <Input type="number" min="1" max="10" {...field} value={field.value ?? ""} />
          </FormControl>
          <FormDescription>{labels.filesHint}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function AllowLateField({ control }: TaskFieldProps) {
  const labels = teachAssessmentMessages.assessments.task

  return (
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
  )
}
