"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FilterField } from "@/components/shared/filter-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { courseMessages } from "@/lib/messages/admin-courses"
import type { CourseStatus } from "../types"

const ALL = "ALL"
const STATUSES: CourseStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

/** Status dropdown driving the course list through the `status` URL param. */
export function CourseStatusFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) {
      params.delete("status")
    } else {
      params.set("status", value)
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <FilterField label={courseMessages.list.statusHeader}>
      <Select value={searchParams.get("status") ?? ALL} onValueChange={(value) => setStatus(value ?? ALL)}>
        <SelectTrigger aria-label={courseMessages.list.statusHeader} className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{courseMessages.list.statusFilterAll}</SelectItem>
          {STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {courseMessages.status[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  )
}
