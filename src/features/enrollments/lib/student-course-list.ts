/**
 * The student "Cursos" screen model: one list mixing the student's enrollments
 * and the org's available FREE courses, each with the state that decides its
 * card and its single action. Pure (inject `now`), unit-tested.
 */
import type { AvailableCourse, StudentEnrollment } from "../types"

export type StudentCourseState = "IN_PROGRESS" | "NOT_STARTED" | "AVAILABLE" | "FINISHED" | "CLOSED"

export type StudentCourseItem =
  | { kind: "enrollment"; key: string; title: string; state: Exclude<StudentCourseState, "AVAILABLE">; enrollment: StudentEnrollment }
  | { kind: "available"; key: string; title: string; state: "AVAILABLE"; course: AvailableCourse }

export function enrollmentState(enrollment: StudentEnrollment, now: Date): Exclude<StudentCourseState, "AVAILABLE"> {
  if (enrollment.status === "COMPLETED") return "FINISHED"
  const ended = enrollment.endsAt !== null && new Date(enrollment.endsAt).getTime() < now.getTime()
  if (enrollment.closed || ended) return "CLOSED"
  return enrollment.completedBlocks > 0 ? "IN_PROGRESS" : "NOT_STARTED"
}

/** Enrollments keep the server order (newest enrollment first); available courses by title. */
export function buildCourseList(
  enrollments: StudentEnrollment[],
  available: AvailableCourse[],
  now: Date
): StudentCourseItem[] {
  return [
    ...enrollments.map(
      (enrollment): StudentCourseItem => ({
        kind: "enrollment",
        key: `e:${enrollment.id}`,
        title: enrollment.courseTitle,
        state: enrollmentState(enrollment, now),
        enrollment,
      })
    ),
    ...[...available]
      .sort((a, b) => a.title.localeCompare(b.title, "es"))
      .map(
        (course): StudentCourseItem => ({
          kind: "available",
          key: `c:${course.id}`,
          title: course.title,
          state: "AVAILABLE",
          course,
        })
      ),
  ]
}

const byRecentActivity = (a: StudentCourseItem, b: StudentCourseItem) =>
  activityOf(b).localeCompare(activityOf(a))

function activityOf(item: StudentCourseItem): string {
  return item.kind === "enrollment" ? item.enrollment.lastActivityAt : ""
}

function completedOf(item: StudentCourseItem): string {
  return item.kind === "enrollment" ? (item.enrollment.completedAt ?? "") : ""
}

function inState(items: StudentCourseItem[], state: StudentCourseState): StudentCourseItem[] {
  return items.filter((item) => item.state === state)
}

/** "Todos": what you can act on. In progress (recent first) → not started → available. */
export function orderForAll(items: StudentCourseItem[]): StudentCourseItem[] {
  return [
    ...inState(items, "IN_PROGRESS").sort(byRecentActivity),
    ...inState(items, "NOT_STARTED"),
    ...inState(items, "AVAILABLE"),
  ]
}

/** "Mis cursos": every enrollment. In progress (recent first) → not started → finished → closed. */
export function orderForMine(items: StudentCourseItem[]): StudentCourseItem[] {
  return [
    ...inState(items, "IN_PROGRESS").sort(byRecentActivity),
    ...inState(items, "NOT_STARTED"),
    ...inState(items, "FINISHED").sort((a, b) => completedOf(b).localeCompare(completedOf(a))),
    ...inState(items, "CLOSED"),
  ]
}
