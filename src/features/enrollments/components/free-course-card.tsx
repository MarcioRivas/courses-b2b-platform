"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { learnMessages } from "@/lib/messages/learn"
import { selfEnroll } from "../actions/self-enroll"
import type { FreeCourse } from "../types"

/** Catalog entry: self-enroll, then jump straight into the new enrollment (§48). */
export function FreeCourseCard({ course }: { course: FreeCourse }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function enroll() {
    startTransition(async () => {
      const result = await selfEnroll({ courseId: course.id })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(learnMessages.catalog.enrolled)
      router.push(`/learn/courses/${result.data.enrollmentId}`)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading font-semibold leading-tight">{course.title}</h3>
        {course.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>
        )}
      </div>
      <Button type="button" size="sm" className="self-start" disabled={isPending} onClick={enroll}>
        {learnMessages.catalog.enrollAction}
      </Button>
    </div>
  )
}
