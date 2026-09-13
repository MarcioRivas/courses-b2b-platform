"use client"

import { useTransition, useState, type ReactElement } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createCourse } from "../actions/create-course"
import { updateCourse } from "../actions/update-course"
import { createCourseSchema, type CreateCourseInput } from "../schemas/course-schemas"
import type { CourseDetail } from "../types"

interface CourseFormProps {
  mode: "create" | "edit"
  course?: Pick<CourseDetail, "id" | "title" | "description" | "accessType" | "status">
  /** "dialog" (default, mirrors GroupForm) for the edit flow; "inline" renders a plain full-page form for `/admin/courses/new`. */
  variant?: "dialog" | "inline"
  trigger?: ReactElement
}

/** Self-contained create/edit form for courses, either as a dialog or an inline page section. */
export function CourseForm({ mode, course, variant = "dialog", trigger }: CourseFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const accessTypeLocked = mode === "edit" && course?.status !== "DRAFT"

  const form = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      title: course?.title ?? "",
      description: course?.description ?? "",
      accessType: course?.accessType ?? "PRIVATE",
    },
  })

  function onSubmit(values: CreateCourseInput) {
    startTransition(async () => {
      if (mode === "create") {
        const result = await createCourse(values)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        toast.success(courseMessages.form.saved)
        router.push(`/admin/courses/${result.data.id}`)
        return
      }

      const result = await updateCourse({ courseId: course!.id, ...values })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(courseMessages.form.saved)
      setOpen(false)
    })
  }

  const fields = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{courseMessages.form.titleLabel}</FormLabel>
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
              <FormLabel>{courseMessages.form.descriptionLabel}</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accessType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{courseMessages.form.accessTypeLabel}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={accessTypeLocked}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="FREE">{courseMessages.access.FREE}</SelectItem>
                  <SelectItem value="PRIVATE">{courseMessages.access.PRIVATE}</SelectItem>
                </SelectContent>
              </Select>
              {accessTypeLocked && (
                <p className="text-xs text-muted-foreground">{courseMessages.form.accessTypeHelpLocked}</p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        {variant === "inline" ? (
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? messages.common.loading : messages.common.create}
          </Button>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? messages.common.loading : messages.common.save}
            </Button>
          </DialogFooter>
        )}
      </form>
    </Form>
  )

  if (variant === "inline") {
    return fields
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger!} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? courseMessages.form.createTitle : courseMessages.form.editTitle}</DialogTitle>
        </DialogHeader>
        {fields}
      </DialogContent>
    </Dialog>
  )
}
