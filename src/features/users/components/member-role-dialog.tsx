"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { setMemberRole } from "../actions/set-member-role"
import type { MembershipRole } from "../schemas/user-schemas"

interface MemberRoleDialogProps {
  membershipId: string
  memberName: string
  currentRole: MembershipRole
  organizationId: string
}

export function MemberRoleDialog({ membershipId, memberName, currentRole, organizationId }: MemberRoleDialogProps) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<MembershipRole>(currentRole)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setRole(currentRole)
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await setMemberRole({ membershipId, role, organizationId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(adminMembersMessages.roleDialog.success)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {adminMembersMessages.roleDialog.trigger}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adminMembersMessages.roleDialog.title}</DialogTitle>
          <DialogDescription>{adminMembersMessages.roleDialog.description(memberName)}</DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={(value) => setRole(value as MembershipRole)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">{messages.roles.ADMIN}</SelectItem>
            <SelectItem value="PROFESSOR">{messages.roles.PROFESSOR}</SelectItem>
            <SelectItem value="STUDENT">{messages.roles.STUDENT}</SelectItem>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || role === currentRole}>
            {isPending ? messages.common.loading : adminMembersMessages.roleDialog.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
