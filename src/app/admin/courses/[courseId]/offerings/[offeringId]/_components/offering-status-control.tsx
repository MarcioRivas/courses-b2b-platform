"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { setOfferingStatus } from "@/features/offerings/actions/set-offering-status"
import type { OfferingStatus } from "@/features/offerings/types"

interface OfferingStatusControlProps {
  offeringId: string
  status: OfferingStatus
}

/** Inline status Select — changes apply immediately (mirrors MemberRoleDialog's Select, without the confirm step). */
export function OfferingStatusControl({ offeringId, status }: OfferingStatusControlProps) {
  const [current, setCurrent] = useState(status)
  const [, startTransition] = useTransition()

  function handleChange(value: string | null) {
    if (!value) return
    const next = value as OfferingStatus
    const previous = current
    setCurrent(next)
    startTransition(async () => {
      const result = await setOfferingStatus({ offeringId, status: next })
      if (!result.ok) {
        toast.error(result.message)
        setCurrent(previous)
        return
      }
      toast.success(offeringMessages.statusForm.saved)
    })
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ACTIVE">{offeringMessages.status.ACTIVE}</SelectItem>
        <SelectItem value="CANCELLED">{offeringMessages.status.CANCELLED}</SelectItem>
      </SelectContent>
    </Select>
  )
}
