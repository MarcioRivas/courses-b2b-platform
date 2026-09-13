"use client"

import { useState, useTransition, type ReactElement } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createModule } from "../actions/create-module"
import { updateModule } from "../actions/update-module"
import { createModuleSchema, type CreateModuleInput } from "../schemas/module-schemas"

interface ModuleFormProps {
  trigger: ReactElement
  mode: "create" | "edit"
  courseId: string
  module?: { id: string; title: string; description: string | null }
  onSaved?: () => void
}

export function ModuleForm({ trigger, mode, courseId, module, onSaved }: ModuleFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<CreateModuleInput>({
    resolver: zodResolver(createModuleSchema),
    defaultValues: { courseId, title: module?.title ?? "", description: module?.description ?? "" },
  })

  function onSubmit(values: CreateModuleInput) {
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createModule(values)
          : await updateModule({ moduleId: module!.id, title: values.title, description: values.description })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(contentMessages.modules.saved)
      setOpen(false)
      onSaved?.()
      form.reset(mode === "create" ? { courseId, title: "", description: "" } : values)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? contentMessages.modules.createTitle : contentMessages.modules.editTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{contentMessages.modules.titleLabel}</FormLabel>
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
                  <FormLabel>{contentMessages.modules.descriptionLabel}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
