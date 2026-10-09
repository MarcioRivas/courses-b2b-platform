"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FilterField } from "@/components/shared/filter-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { analyticsMessages } from "@/lib/messages/analytics"

const ALL = "ALL"

/** Course dropdown driving the "Por edición" table through the `course` URL param. */
export function OfferingStatsCourseFilter({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const m = analyticsMessages.admin.offerings

  function setCourse(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) {
      params.delete("course")
    } else {
      params.set("course", value)
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <FilterField label={m.courseFilterLabel}>
      <Select value={searchParams.get("course") ?? ALL} onValueChange={(value) => setCourse(value ?? ALL)}>
        <SelectTrigger aria-label={m.courseFilterLabel} className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{m.courseFilterAll}</SelectItem>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {course.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  )
}
