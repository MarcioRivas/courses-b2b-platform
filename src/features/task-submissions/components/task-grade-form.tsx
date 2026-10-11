"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { GradePreviewDialog } from "@/features/grading/components/grade-preview-dialog"
import { useUnsavedChangesGuard } from "@/features/grading/components/use-unsaved-changes-guard"
import { resolveScoreLabel, type ScoreRangeForLabel } from "@/features/organizations/score-label"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { gradeTask } from "../actions/grade-task"
import { gradeTaskSchema, type GradeTaskInput } from "../schemas/task-submission-schemas"

interface TaskGradeFormProps {
  attemptId: string
  submittedAt: string | null
  /** Pre-fills the form when re-grading. */
  initialScore: number | null
  initialFeedback: string | null
  scoreRanges: ScoreRangeForLabel[]
}

/** One 0..100 score plus feedback for a TASK submission; re-grading uses the same form. */
export function TaskGradeForm({ attemptId, submittedAt, initialScore, initialFeedback, scoreRanges }: TaskGradeFormProps) {
  const router = useRouter()
  const [pendingValues, setPendingValues] = useState<GradeTaskInput | null>(null)
  const copy = taskSubmissionMessages.grading

  const form = useForm<GradeTaskInput>({
    resolver: zodResolver(gradeTaskSchema),
    defaultValues: {
      attemptId,
      submittedAt,
      score: initialScore === null ? "" : String(Math.round(initialScore)),
      feedback: initialFeedback ?? "",
    },
  })

  useUnsavedChangesGuard(form.formState.isDirty)

  async function confirmGrade() {
    if (!pendingValues) {
      return { ok: false as const, code: "VALIDATION" as const, message: taskSubmissionMessages.validation.scoreRange }
    }
    const result = await gradeTask(pendingValues)
    if (result.ok) {
      toast.success(copy.saved)
      form.reset(pendingValues)
      router.refresh()
    }
    return result
  }

  const percent = pendingValues ? Number(pendingValues.score) : null
  const range = percent === null || Number.isNaN(percent) ? null : resolveScoreLabel(scoreRanges, percent)

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => setPendingValues(values))} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="score"
          render={({ field }) => (
            <FormItem className="sm:max-w-40">
              <FormLabel>{copy.scoreLabel}</FormLabel>
              <FormControl>
                <Input type="number" min="0" max="100" step="1" inputMode="numeric" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="feedback"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.feedbackLabel}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} rows={5} placeholder={copy.feedbackPlaceholder} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="self-start">
          {copy.saveAction}
        </Button>
      </form>
      <GradePreviewDialog
        open={pendingValues !== null}
        onOpenChange={(open) => !open && setPendingValues(null)}
        percent={percent}
        label={range?.label ?? null}
        isPassing={range?.isPassing ?? null}
        ungradedCount={0}
        onConfirm={confirmGrade}
      />
    </Form>
  )
}
