"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchInput } from "@/components/shared/search-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { messages } from "@/lib/messages/es"
import { auditMessages } from "@/lib/messages/audit"
import { entityTypeLabel } from "../action-catalog"
import type { AuditActionOption } from "../types"

const ALL = "ALL"

interface OrganizationOption {
  id: string
  name: string
}

interface AuditFiltersProps {
  actionOptions: AuditActionOption[]
  /** Platform variant only: adds the cross-org filter. */
  organizations?: OrganizationOption[]
}

/** Actor search + acción/entidad/fecha selects, driving the URL like `MemberFilters`. */
export function AuditFilters({ actionOptions, organizations }: AuditFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  const entityTypes = Array.from(new Set(actionOptions.map((option) => option.entityType)))

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput paramName="actor" placeholder={auditMessages.filters.actorPlaceholder} />

      <Select value={searchParams.get("action") ?? ALL} onValueChange={(value) => setParam("action", value ?? ALL)}>
        <SelectTrigger aria-label={auditMessages.filters.actionLabel} className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          {actionOptions.map((option) => (
            <SelectItem key={option.action} value={option.action}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("entityType") ?? ALL} onValueChange={(value) => setParam("entityType", value ?? ALL)}>
        <SelectTrigger aria-label={auditMessages.filters.entityTypeLabel} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          {entityTypes.map((entityType) => (
            <SelectItem key={entityType} value={entityType}>
              {entityTypeLabel(entityType)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {organizations && (
        <Select
          value={searchParams.get("organizationId") ?? ALL}
          onValueChange={(value) => setParam("organizationId", value ?? ALL)}
        >
          <SelectTrigger aria-label={auditMessages.filters.organizationLabel} className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{messages.common.all}</SelectItem>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        type="date"
        aria-label={auditMessages.filters.fromLabel}
        value={searchParams.get("from") ?? ""}
        onChange={(event) => setParam("from", event.target.value)}
        className="w-full sm:w-auto"
      />
      <Input
        type="date"
        aria-label={auditMessages.filters.toLabel}
        value={searchParams.get("to") ?? ""}
        onChange={(event) => setParam("to", event.target.value)}
        className="w-full sm:w-auto"
      />
    </div>
  )
}
