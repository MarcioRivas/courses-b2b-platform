"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { messages } from "@/lib/messages/es"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { GradableAssessmentOption } from "../types"

const ALL = "ALL"

interface GradingFiltersProps {
  courses: { id: string; title: string }[]
  assessments: GradableAssessmentOption[]
}

/** Course + assessment selects, URL-driven like `MemberFilters` (§44). */
export function GradingFilters({ courses, assessments }: GradingFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const courseId = searchParams.get("courseId") ?? ALL
  const assessmentId = searchParams.get("assessmentId") ?? ALL

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    if (key === "courseId") {
      // Changing the course invalidates whatever assessment was selected.
      params.delete("assessmentId")
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  const visibleAssessments =
    courseId === ALL ? assessments : assessments.filter((assessment) => assessment.courseId === courseId)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select value={courseId} onValueChange={(value) => setParam("courseId", value ?? ALL)}>
        <SelectTrigger aria-label={teachGradingMessages.filters.courseLabel} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {course.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={assessmentId} onValueChange={(value) => setParam("assessmentId", value ?? ALL)}>
        <SelectTrigger aria-label={teachGradingMessages.filters.assessmentLabel} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{messages.common.all}</SelectItem>
          {visibleAssessments.map((assessment) => (
            <SelectItem key={assessment.id} value={assessment.id}>
              {assessment.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
