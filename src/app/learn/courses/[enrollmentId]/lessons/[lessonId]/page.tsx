import { notFound, redirect } from "next/navigation"
import { Breadcrumb } from "@/components/shared/breadcrumb"
import { requireOrgRole } from "@/lib/auth/require-role"
import { EmptyState } from "@/components/shared/empty-state"
import { learnMessages } from "@/lib/messages/learn"
import { getEnrollment } from "@/features/enrollments/queries/get-enrollment"
import { getEnrollmentCourseTree } from "@/features/enrollments/queries/get-enrollment-course-tree"
import { getUnlockState } from "@/features/progress/queries/get-unlock-state"
import { moduleStateLabel } from "@/features/progress/unlock-labels"
import { LessonBlock } from "@/features/progress/components/lesson-block"
import { LessonNav } from "@/features/progress/components/lesson-nav"
import { LessonCompleteBanner } from "@/features/progress/components/lesson-complete-banner"
import { isLessonComplete, isModuleComplete, lessonProgress } from "@/features/progress/lib/lesson-completion"
import { ProgressBar } from "@/features/enrollments/components/progress-bar"
import { DirectionalTransition } from "@/components/motion/directional-transition"
import { createClient } from "@/lib/supabase/server"
import { fetchLessonCheckpoints } from "@/features/video-checkpoints/queries/fetch-lesson-checkpoints"

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
    getEnrollmentCourseTree(enrollment.offeringId, enrollment.id),
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

  // In-video checkpoints for every video of this lesson (answer key never included).
  // A failure must not silently drop the gate (videos would play freely and
  // then refuse completion): let the error boundary handle it.
  const lessonCheckpoints = await fetchLessonCheckpoints(await createClient(), enrollment.id, lesson.id)
  if (!lessonCheckpoints) {
    throw new Error("Could not load the lesson's video checkpoints")
  }

  const index = courseModule.lessons.findIndex((candidate) => candidate.id === lessonId)
  const previousLessonId = index > 0 ? (courseModule.lessons[index - 1]?.id ?? null) : null
  const nextLessonId = courseModule.lessons[index + 1]?.id ?? null
  const progress = lessonProgress(lesson)

  return (
    <>
      {/* Keyed by lesson: lesson → lesson remounts it so the directional slide plays.
          The sticky prev/next bar stays outside and doesn't move. */}
      <DirectionalTransition key={lesson.id}>
        <div>
          <header className="mb-6 flex flex-col gap-2">
            <Breadcrumb
              items={[
                { label: learnMessages.dashboard.title, href: "/learn" },
                { label: enrollment.courseTitle, href: `/learn/courses/${enrollment.id}` },
                { label: courseModule.title },
                { label: lesson.title },
              ]}
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{lesson.title}</h1>
              {lesson.description && (
                <p className="mt-1 text-sm text-muted-foreground">{lesson.description}</p>
              )}
            </div>
            {progress.total > 0 && (
              <ProgressBar
                percent={progress.percent}
                completedBlocks={progress.completed}
                totalBlocks={progress.total}
                label={learnMessages.progress.lessonBarLabel}
              />
            )}
          </header>

          {lesson.blocks.length === 0 ? (
            <EmptyState title={learnMessages.lesson.emptyBlocks} />
          ) : (
            <ul className="flex flex-col gap-4">
              {lesson.blocks.map((block, index) => (
                <LessonBlock
                  key={block.id}
                  index={index}
                  enrollmentId={enrollment.id}
                  lessonId={lesson.id}
                  block={block}
                  checkpoints={lessonCheckpoints[block.id] ?? []}
                />
              ))}
            </ul>
          )}

          <LessonCompleteBanner
            lessonComplete={isLessonComplete(lesson)}
            moduleComplete={isModuleComplete(courseModule)}
            moduleTitle={courseModule.title}
            hasNextLesson={nextLessonId !== null}
          />
        </div>
      </DirectionalTransition>

      <LessonNav
        enrollmentId={enrollment.id}
        previousLessonId={previousLessonId}
        nextLessonId={nextLessonId}
      />
    </>
  )
}
