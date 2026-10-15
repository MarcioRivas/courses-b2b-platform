"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { learnCoursesMessages as t } from "@/lib/messages/learn-courses"
import { learnMessages } from "@/lib/messages/learn"
import { selfEnroll } from "../actions/self-enroll"

interface EnrollCourseButtonProps {
  courseId: string
  courseTitle: string
  /** Called after a successful enrollment, before the refresh. */
  onEnrolled?: () => void
}

/**
 * One click, no modal (free, reversible by staff). On success the page
 * refreshes from the server, so the course shows up as "Empezar" among the
 * student's courses, and the toast offers to start right away.
 */
export function EnrollCourseButton({ courseId, courseTitle, onEnrolled }: EnrollCourseButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function enroll() {
    startTransition(async () => {
      try {
        const result = await selfEnroll({ courseId })
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        const href = `/learn/courses/${result.data.enrollmentId}`
        toast.success(t.toasts.enrolled(courseTitle), {
          action: { label: t.actions.startNow, onClick: () => router.push(href) },
        })
        onEnrolled?.()
        router.refresh()
      } catch {
        toast.error(learnMessages.errors.enrollFailed)
      }
    })
  }

  return (
    <Button type="button" size="sm" disabled={isPending} aria-busy={isPending} onClick={enroll}>
      {isPending ? t.actions.enrolling : t.actions.enroll}
    </Button>
  )
}
