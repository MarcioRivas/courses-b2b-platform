import Link from "next/link"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"
import { learnMessages } from "@/lib/messages/learn"
import { NAV_BACK, NAV_FORWARD } from "@/components/motion/directional-transition"

interface LessonNavProps {
  enrollmentId: string
  previousLessonId: string | null
  nextLessonId: string | null
}

/**
 * Sticky prev/next bar for the lesson player. The last lesson of a module falls
 * back to "Volver al curso" rather than dead-ending the student.
 */
export function LessonNav({ enrollmentId, previousLessonId, nextLessonId }: LessonNavProps) {
  const linkClass =
    "group inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-[background-color,scale] duration-150 hover:bg-muted active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

  return (
    <nav
      aria-label={learnMessages.course.lessonsTitle}
      className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4"
    >
      {previousLessonId ? (
        <Link
          href={`/learn/courses/${enrollmentId}/lessons/${previousLessonId}`}
          transitionTypes={NAV_BACK}
          className={linkClass}
        >
          <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
          {learnMessages.lesson.previous}
        </Link>
      ) : (
        <Link href={`/learn/courses/${enrollmentId}`} transitionTypes={NAV_BACK} className={linkClass}>
          <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
          {learnMessages.lesson.backToCourse}
        </Link>
      )}

      {nextLessonId ? (
        <Link
          href={`/learn/courses/${enrollmentId}/lessons/${nextLessonId}`}
          transitionTypes={NAV_FORWARD}
          className={linkClass}
        >
          {learnMessages.lesson.next}
          <ArrowRightIcon className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : (
        <Link href={`/learn/courses/${enrollmentId}`} transitionTypes={NAV_FORWARD} className={linkClass}>
          {learnMessages.lesson.backToCourse}
          <ArrowRightIcon className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </nav>
  )
}
