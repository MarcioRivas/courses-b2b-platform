import Link from "next/link"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"
import { learnMessages } from "@/lib/messages/learn"
import type { StudentLesson } from "@/features/enrollments/queries/get-enrollment-course-tree"

interface LessonListProps {
  enrollmentId: string
  lessons: StudentLesson[]
}

/** Lessons of an open module. Only rendered for modules the server unlocked. */
export function LessonList({ enrollmentId, lessons }: LessonListProps) {
  if (lessons.length === 0) {
    return <p className="text-sm text-muted-foreground">{learnMessages.course.emptyLessons}</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {lessons.map((lesson) => {
        const required = lesson.blocks.filter((block) => block.isRequired)
        const done = required.length > 0 && required.every((block) => block.completed)

        return (
          <li key={lesson.id}>
            <Link
              href={`/learn/courses/${enrollmentId}/lessons/${lesson.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {done ? (
                <CheckCircle2Icon className="size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {learnMessages.course.lessonBlocksLabel(lesson.blocks.length)}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
