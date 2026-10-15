"use client"

import Link from "next/link"
import { CheckCircle2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { learnCoursesMessages as t } from "@/lib/messages/learn-courses"
import { NAV_FORWARD } from "@/components/motion/directional-transition"
import type { StudentCourseItem } from "../lib/student-course-list"
import type { StudentEnrollment } from "../types"
import { EnrollCourseButton } from "./enroll-course-button"
import { ProgressBar } from "./progress-bar"

/** Course page, or straight to the lesson of the last completed block when there is one. */
export function continueHref(enrollment: StudentEnrollment): string {
  const course = `/learn/courses/${enrollment.id}`
  return enrollment.resumeLessonId ? `${course}/lessons/${enrollment.resumeLessonId}` : course
}

/** One card for every state, with at most one action (none when finished or closed). */
export function StudentCourseCard({
  item,
  timeZone,
  onEnrolled,
}: {
  item: StudentCourseItem
  timeZone: string
  onEnrolled?: () => void
}) {
  if (item.kind === "available") {
    const { course } = item
    return (
      <CardShell title={course.title} tag={t.tags.free} tagVariant="success">
        {course.description && <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
        <CardFooter note={t.card.modules(course.moduleCount)}>
          <EnrollCourseButton courseId={course.id} courseTitle={course.title} onEnrolled={onEnrolled} />
        </CardFooter>
      </CardShell>
    )
  }

  const { enrollment, state } = item
  const assigned = enrollment.source === "GROUP_ASSIGNMENT"
  const tag = assigned ? t.tags.assigned : t.tags.free
  const tagVariant = assigned ? "brand" : "success"
  const coursePage = `/learn/courses/${enrollment.id}`

  if (state === "CLOSED") {
    const note = enrollment.endsAt ? t.card.closedOn(formatDateInTimeZone(enrollment.endsAt, timeZone)) : t.card.closed
    return (
      <CardShell title={enrollment.courseTitle} subtitle={enrollment.offeringName} tag={tag} tagVariant={tagVariant} muted>
        <CardFooter note={note} />
      </CardShell>
    )
  }

  if (state === "FINISHED") {
    // No action: a finished course only states it (user decision).
    return (
      <CardShell title={enrollment.courseTitle} subtitle={enrollment.offeringName} tag={tag} tagVariant={tagVariant}>
        <CardFooter>
          <Badge variant="success" className="gap-1">
            <CheckCircle2Icon aria-hidden="true" className="size-3.5" />
            {t.card.finished}
          </Badge>
        </CardFooter>
      </CardShell>
    )
  }

  const inProgress = state === "IN_PROGRESS"
  return (
    <CardShell title={enrollment.courseTitle} subtitle={enrollment.offeringName} tag={tag} tagVariant={tagVariant}>
      {inProgress && (
        <ProgressBar
          percent={enrollment.progressPercent}
          completedBlocks={enrollment.completedBlocks}
          totalBlocks={enrollment.totalBlocks}
          compact
        />
      )}
      <CardFooter>
        <Button
          size="sm"
          render={<Link href={inProgress ? continueHref(enrollment) : coursePage} transitionTypes={NAV_FORWARD} />}
        >
          {inProgress ? t.actions.continue : t.actions.start}
        </Button>
      </CardFooter>
    </CardShell>
  )
}

function CardShell({
  title,
  subtitle,
  tag,
  tagVariant,
  muted = false,
  children,
}: {
  title: string
  subtitle?: string
  tag: string
  tagVariant: "brand" | "success"
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card",
        muted && "bg-muted/40 text-muted-foreground shadow-none"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading leading-tight font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Badge variant={tagVariant} className="shrink-0">
          {tag}
        </Badge>
      </div>
      {children}
    </article>
  )
}

function CardFooter({ note, children }: { note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
      <span>{note}</span>
      {children}
    </div>
  )
}
