"use client"

import { useState, useTransition, type ReactElement } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createGroup } from "../actions/create-group"
import { updateGroup } from "../actions/update-group"
import { createGroupSchema, type CreateGroupInput } from "../schemas/group-schemas"

interface GroupFormProps {
  trigger: ReactElement
  mode: "create" | "edit"
  group?: { id: string; name: string; description: string | null }
}

/** Self-contained Dialog + form for both create and edit (mirrors ConfirmDialog's `trigger` convention). */
export function GroupForm({ trigger, mode, group }: GroupFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: group?.name ?? "", description: group?.description ?? "" },
  })

  function onSubmit(values: CreateGroupInput) {
    startTransition(async () => {
      const result =
        mode === "create" ? await createGroup(values) : await updateGroup({ groupId: group!.id, ...values })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(groupMessages.form.saved)
      setOpen(false)
      form.reset(mode === "create" ? { name: "", description: "" } : values)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? groupMessages.form.createTitle : groupMessages.form.editTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{groupMessages.form.nameLabel}</FormLabel>
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
                  <FormLabel>{groupMessages.form.descriptionLabel}</FormLabel>
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
