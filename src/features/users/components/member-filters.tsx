"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchInput } from "@/components/shared/search-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"

const ALL = "ALL"

/** Role + status selects, combined with the shared debounced `SearchInput` (§44). */
export function MemberFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchInput paramName="q" placeholder={adminMembersMessages.searchPlaceholder} />
      <Select value={searchParams.get("role") ?? ALL} onValueChange={(value) => setParam("role", value ?? ALL)}>
        <SelectTrigger aria-label={adminMembersMessages.filters.roleLabel} className="w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          <SelectItem value="ADMIN">{messages.roles.ADMIN}</SelectItem>
          <SelectItem value="PROFESSOR">{messages.roles.PROFESSOR}</SelectItem>
          <SelectItem value="STUDENT">{messages.roles.STUDENT}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => setParam("status", value ?? ALL)}>
        <SelectTrigger aria-label={adminMembersMessages.filters.statusLabel} className="w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          <SelectItem value="ACTIVE">{messages.memberStatus.ACTIVE}</SelectItem>
          <SelectItem value="INACTIVE">{messages.memberStatus.INACTIVE}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
