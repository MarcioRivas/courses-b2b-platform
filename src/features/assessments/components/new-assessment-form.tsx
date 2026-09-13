"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { createAssessment } from "../actions/create-assessment"
import { createAssessmentSchema, type CreateAssessmentInput } from "../schemas/assessment-schemas"

/** Bare create (title + kind, B3/D12 defaults applied server-side); full config happens on the detail page. */
export function NewAssessmentForm({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.assessments

  const form = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: { courseId, title: "", kind: "QUIZ" },
  })

  function onSubmit(values: CreateAssessmentInput) {
    startTransition(async () => {
      const result = await createAssessment(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      router.push(`/teach/courses/${courseId}/assessments/${result.data.id}`)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4 rounded-lg border p-4">
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
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.kindLabel}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
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
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? messages.common.loading : messages.common.create}
        </Button>
      </form>
    </Form>
  )
}
