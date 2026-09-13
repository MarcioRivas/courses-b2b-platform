"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { setMemberStatus } from "../actions/set-member-status"
import type { MembershipStatus } from "../schemas/user-schemas"

interface MemberStatusToggleProps {
  membershipId: string
  memberName: string
  status: MembershipStatus
  organizationId: string
}

/** Deactivating cancels ACTIVE enrollments and does not auto-restore them on reactivation (D29). */
export function MemberStatusToggle({ membershipId, memberName, status, organizationId }: MemberStatusToggleProps) {
  const isActive = status === "ACTIVE"
  const nextStatus: MembershipStatus = isActive ? "INACTIVE" : "ACTIVE"
  const copy = adminMembersMessages.statusToggle

  return (
    <ConfirmDialog
      trigger={
        <Button variant={isActive ? "destructive" : "outline"} size="sm">
          {isActive ? copy.deactivateTrigger : copy.activateTrigger}
        </Button>
      }
      title={isActive ? copy.deactivateTitle : copy.activateTitle}
      description={isActive ? copy.deactivateDescription(memberName) : copy.activateDescription(memberName)}
      confirmLabel={isActive ? copy.confirmDeactivate : copy.confirmActivate}
      destructive={isActive}
      successMessage={isActive ? copy.successDeactivate : copy.successActivate}
      action={setMemberStatus}
      input={{ membershipId, status: nextStatus, organizationId }}
    />
  )
}
