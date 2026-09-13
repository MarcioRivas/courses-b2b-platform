"use client"

import { useState, useTransition, type ReactElement } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createBank } from "../actions/create-bank"
import { updateBank } from "../actions/update-bank"
import { createBankSchema, type CreateBankInput } from "../schemas/question-schemas"
import type { CourseOption } from "../types"

const ORG_WIDE_VALUE = "__org_wide__"

interface BankFormProps {
  trigger: ReactElement
  mode: "create" | "edit"
  courses: CourseOption[]
  bank?: { id: string; name: string; description: string | null; courseId: string | null }
}

export function BankForm({ trigger, mode, courses, bank }: BankFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.banks

  const form = useForm<CreateBankInput>({
    resolver: zodResolver(createBankSchema),
    defaultValues: {
      courseId: bank?.courseId ?? undefined,
      name: bank?.name ?? "",
      description: bank?.description ?? "",
    },
  })

  function onSubmit(values: CreateBankInput) {
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createBank(values)
          : await updateBank({ bankId: bank!.id, name: values.name, description: values.description })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.saved)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? labels.createTitle : labels.editTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{labels.nameLabel}</FormLabel>
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
            {mode === "create" && (
              <FormField
                control={form.control}
                name="courseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{labels.courseLabel}</FormLabel>
                    <Select
                      value={field.value ?? ORG_WIDE_VALUE}
                      onValueChange={(value) => field.onChange(value === ORG_WIDE_VALUE ? undefined : value)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={labels.courseOrgWidePlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ORG_WIDE_VALUE}>{labels.courseOrgWidePlaceholder}</SelectItem>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                {messages.common.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? messages.common.loading : messages.common.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
