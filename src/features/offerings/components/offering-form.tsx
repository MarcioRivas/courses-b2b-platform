"use client"

import { useState, useTransition, type ReactElement } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { createOffering } from "../actions/create-offering"
import { updateOffering } from "../actions/update-offering"
import { createOfferingSchema, type CreateOfferingInput } from "../schemas/offering-schemas"
import { utcIsoToLocalDateTimeInput } from "../lib/local-datetime"
import type { OfferingDetail, OrgGroupOption } from "../types"

interface OfferingFormProps {
  trigger: ReactElement
  mode: "create" | "edit"
  courseId: string
  /** PRIVATE courses require a group (kind = GROUP); FREE courses get the auto-managed OPEN offering. */
  courseAccessType: "FREE" | "PRIVATE"
  groups: OrgGroupOption[]
  timeZone: string
  offering?: Pick<OfferingDetail, "id" | "name" | "groupId" | "startsAt" | "endsAt">
}

export function OfferingForm({
  trigger,
  mode,
  courseId,
  courseAccessType,
  groups,
  timeZone,
  offering,
}: OfferingFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isGroupKind = courseAccessType === "PRIVATE"

  const form = useForm<CreateOfferingInput>({
    resolver: zodResolver(createOfferingSchema),
    defaultValues: {
      courseId,
      name: offering?.name ?? "",
      groupId: offering?.groupId ?? undefined,
      startsAt: utcIsoToLocalDateTimeInput(offering?.startsAt ?? null, timeZone),
      endsAt: utcIsoToLocalDateTimeInput(offering?.endsAt ?? null, timeZone),
    },
  })

  function onSubmit(values: CreateOfferingInput) {
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createOffering(values)
          : await updateOffering({
              offeringId: offering!.id,
              name: values.name,
              groupId: values.groupId,
              startsAt: values.startsAt,
              endsAt: values.endsAt,
            })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(offeringMessages.form.saved)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? offeringMessages.form.createTitle : offeringMessages.form.editTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{offeringMessages.form.nameLabel}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isGroupKind ? (
              <FormField
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{offeringMessages.form.groupLabel}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={offeringMessages.form.groupPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{offeringMessages.form.kindLabelOpen}</p>
            )}
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{offeringMessages.form.startsAtLabel}</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{offeringMessages.form.endsAtLabel}</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
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
