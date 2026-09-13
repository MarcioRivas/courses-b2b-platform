"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { toggleRegistrationLink } from "../actions/toggle-link"
import { revokeRegistrationLink } from "../actions/revoke-link"
import { linkState } from "../link-state"
import type { LinkListItem } from "../queries/list-links"

interface LinkRowActionsProps {
  link: LinkListItem
  organizationId: string
}

/** Activate/deactivate (plain toggle) + revoke (irreversible, gated by `ConfirmDialog`). */
export function LinkRowActions({ link, organizationId }: LinkRowActionsProps) {
  const [isPending, startTransition] = useTransition()

  if (linkState(link) === "REVOKED") {
    return null
  }

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleRegistrationLink({
        linkId: link.id,
        organizationId,
        isActive: !link.isActive,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(
        link.isActive ? adminLinksMessages.toggle.successDeactivate : adminLinksMessages.toggle.successActivate
      )
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleToggle} disabled={isPending}>
        {link.isActive ? adminLinksMessages.toggle.deactivateTrigger : adminLinksMessages.toggle.activateTrigger}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm">
            {adminLinksMessages.revoke.trigger}
          </Button>
        }
        title={adminLinksMessages.revoke.title}
        description={adminLinksMessages.revoke.description}
        confirmLabel={adminLinksMessages.revoke.confirm}
        destructive
        successMessage={adminLinksMessages.revoke.success}
        action={revokeRegistrationLink}
        input={{ linkId: link.id, organizationId }}
      />
    </div>
  )
}
