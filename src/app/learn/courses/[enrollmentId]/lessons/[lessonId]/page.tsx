import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { EmptyState } from "@/components/shared/empty-state"
import { learnMessages } from "@/lib/messages/learn"
import { getEnrollment } from "@/features/enrollments/queries/get-enrollment"
import { getEnrollmentCourseTree } from "@/features/enrollments/queries/get-enrollment-course-tree"
import { getUnlockState } from "@/features/progress/queries/get-unlock-state"
import { moduleStateLabel } from "@/features/progress/unlock-labels"
import { LessonBlock } from "@/features/progress/components/lesson-block"
import { LessonNav } from "@/features/progress/components/lesson-nav"

interface PageProps {
  params: Promise<{ enrollmentId: string; lessonId: string }>
}

export default async function StudentLessonPage({ params }: PageProps) {
  await requireOrgRole(["STUDENT"])
  const { enrollmentId, lessonId } = await params

  const enrollment = await getEnrollment(enrollmentId)

  if (!enrollment) {
    notFound()
  }

  const [modules, unlockStates] = await Promise.all([
    getEnrollmentCourseTree(enrollment.courseId, enrollment.id),
    getUnlockState(enrollment.id),
  ])

  const courseModule = modules.find((candidate) =>
    candidate.lessons.some((lesson) => lesson.id === lessonId)
  )
  const lesson = courseModule?.lessons.find((candidate) => candidate.id === lessonId)

  if (!courseModule || !lesson) {
    notFound()
  }

  // The same server answer the course page rendered. A student who deep-links
  // into a locked module lands back on the course page, where the chip already
  // explains why — the RPC would reject any write from here regardless.
  const unlock = unlockStates.find((state) => state.moduleId === courseModule.id)

  if (!moduleStateLabel(unlock?.state ?? "LOCKED_DEPENDENCY").openable) {
    redirect(`/learn/courses/${enrollment.id}`)
  }

  const index = courseModule.lessons.findIndex((candidate) => candidate.id === lessonId)
  const previousLessonId = index > 0 ? (courseModule.lessons[index - 1]?.id ?? null) : null
  const nextLessonId = courseModule.lessons[index + 1]?.id ?? null

  return (
    <>
      <header className="mb-6 flex flex-col gap-2">
        <Link
          href={`/learn/courses/${enrollment.id}`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {learnMessages.lesson.backToCourse}
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {courseModule.title}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{lesson.title}</h1>
          {lesson.description && (
            <p className="mt-1 text-sm text-muted-foreground">{lesson.description}</p>
          )}
        </div>
      </header>

      {lesson.blocks.length === 0 ? (
        <EmptyState title={learnMessages.lesson.emptyBlocks} />
      ) : (
        <ul className="flex flex-col gap-4">
          {lesson.blocks.map((block) => (
            <LessonBlock key={block.id} enrollmentId={enrollment.id} block={block} />
          ))}
        </ul>
      )}

      <LessonNav
        enrollmentId={enrollment.id}
        previousLessonId={previousLessonId}
        nextLessonId={nextLessonId}
      />
    </>
  )
}
