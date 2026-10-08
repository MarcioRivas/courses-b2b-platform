"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { gradeTask } from "../actions/grade-task"
import { gradeTaskSchema, type GradeTaskInput } from "../schemas/task-submission-schemas"

interface TaskGradeFormProps {
  attemptId: string
  submittedAt: string | null
  /** Pre-fills the form when re-grading. */
  initialScore: number | null
  initialFeedback: string | null
}

/** One 0..100 score plus feedback for a TASK submission; re-grading uses the same form. */
export function TaskGradeForm({ attemptId, submittedAt, initialScore, initialFeedback }: TaskGradeFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
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

  function onSubmit(values: GradeTaskInput) {
    startTransition(async () => {
      const result = await gradeTask(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(copy.saved)
      router.refresh()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? copy.saving : copy.saveAction}
        </Button>
      </form>
    </Form>
  )
}
