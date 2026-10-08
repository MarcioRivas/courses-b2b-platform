"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { ProfileFields } from "@/features/auth/components/profile-fields"
import type { ProfileFieldsInput } from "@/features/auth/schemas/auth-schemas"
import { updateMemberProfileSchema } from "../schemas/user-schemas"
import { updateMemberProfile } from "../actions/update-member-profile"

interface MemberProfileDialogProps {
  userId: string
  organizationId: string
  memberName: string
  initial: ProfileFieldsInput
}

export function MemberProfileDialog({ userId, organizationId, memberName, initial }: MemberProfileDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<ProfileFieldsInput>({
    resolver: zodResolver(updateMemberProfileSchema.omit({ userId: true, organizationId: true })),
    defaultValues: initial,
  })

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      form.reset(initial)
    }
  }

  function onSubmit(values: ProfileFieldsInput) {
    startTransition(async () => {
      const result = await updateMemberProfile({ ...values, userId, organizationId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(adminMembersMessages.profileDialog.success)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {adminMembersMessages.profileDialog.trigger}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adminMembersMessages.profileDialog.title}</DialogTitle>
          <DialogDescription>{adminMembersMessages.profileDialog.description(memberName)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <ProfileFields />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                {messages.common.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? messages.common.loading : adminMembersMessages.profileDialog.submit}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
