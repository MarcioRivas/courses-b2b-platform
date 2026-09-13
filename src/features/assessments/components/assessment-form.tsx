"use client"

import { useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { updateAssessment } from "../actions/update-assessment"
import { updateAssessmentSchema, type UpdateAssessmentInput } from "../schemas/assessment-schemas"
import { utcIsoToLocalDateTimeInput } from "../lib/local-datetime"
import { WindowFields } from "./window-fields"
import type { AssessmentDetail } from "../types"

interface AssessmentFormProps {
  assessment: AssessmentDetail
  timeZone: string
  /** PUBLISHED: `kind` and (for EXAM) the window/duration fields are locked (M3) — use "Extender ventana" instead. */
  isPublished: boolean
  /** A lesson content block or module dependency already points at this assessment — `kind` is locked regardless of status (M3). */
  isReferenced: boolean
}

/** Full config editor (5B step 3): title, kind, passing score, attempts + the conditional window/duration fields. */
export function AssessmentForm({ assessment, timeZone, isPublished, isReferenced }: AssessmentFormProps) {
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.assessments
  const kindLocked = isPublished || isReferenced
  const windowLocked = isPublished && assessment.kind === "EXAM"

  const form = useForm<UpdateAssessmentInput>({
    resolver: zodResolver(updateAssessmentSchema),
    defaultValues: {
      assessmentId: assessment.id,
      title: assessment.title,
      description: assessment.description ?? "",
      kind: assessment.kind,
      passingScore: String(assessment.passingScore ?? 60),
      maxAttempts: assessment.maxAttempts ? String(assessment.maxAttempts) : "",
      durationMinutes: assessment.durationSeconds ? String(Math.round(assessment.durationSeconds / 60)) : "",
      availableFrom: utcIsoToLocalDateTimeInput(assessment.availableFrom, timeZone),
      availableUntil: utcIsoToLocalDateTimeInput(assessment.availableUntil, timeZone),
    },
  })

  const kind = useWatch({ control: form.control, name: "kind" })

  function onSubmit(values: UpdateAssessmentInput) {
    startTransition(async () => {
      const result = await updateAssessment(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.saved)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-lg border p-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.titleLabel}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.descriptionLabel}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.kindLabel}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={kindLocked}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="QUIZ">{labels.kinds.QUIZ}</SelectItem>
                    <SelectItem value="TASK">{labels.kinds.TASK}</SelectItem>
                    <SelectItem value="EXAM">{labels.kinds.EXAM}</SelectItem>
                  </SelectContent>
                </Select>
                {kindLocked && <p className="text-xs text-muted-foreground">{labels.kindLockedHint}</p>}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="passingScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.passingScoreLabel}</FormLabel>
                <FormControl>
                  <Input type="number" min="0" max="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxAttempts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.maxAttemptsLabel}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    disabled={kind === "QUIZ"}
                    placeholder={labels.unlimitedAttempts}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <WindowFields control={form.control} kind={kind} disabled={windowLocked} />
        {windowLocked && <p className="text-xs text-muted-foreground">{labels.windowLockedHint}</p>}

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? messages.common.loading : labels.saveConfigAction}
        </Button>
      </form>
    </Form>
  )
}
