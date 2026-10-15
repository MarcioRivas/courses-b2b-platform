import { DirectionalTransition } from "@/components/motion/directional-transition"
import { GraduationCapIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { learnCoursesMessages } from "@/lib/messages/learn-courses"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { listMyEnrollments } from "@/features/enrollments/queries/list-my-enrollments"
import { listAvailableCourses } from "@/features/enrollments/queries/list-available-courses"
import { StudentCoursesBrowser } from "@/features/enrollments/components/student-courses-browser"

/**
 * The student's only screen: their courses and the org's free courses they can
 * join, in one filterable list (3 parallel reads; filters live in the URL and
 * run in the browser, see useCourseListParams).
 * Exam/quiz results live inside each course, not here (user decision).
 */
export default async function LearnPage() {
  const ctx = await requireOrgRole(["STUDENT"])

  const [enrollments, available, settings] = await Promise.all([
    listMyEnrollments(),
    listAvailableCourses(ctx.organizationId),
    getOrgSettings(ctx.organizationId),
  ])

  return (
    <DirectionalTransition>
      <div>
        <PageHeader
          icon={GraduationCapIcon}
          title={learnCoursesMessages.title}
          description={learnCoursesMessages.description}
        />
        <StudentCoursesBrowser
          enrollments={enrollments}
          available={available}
          timeZone={settings?.timezone ?? DEFAULT_TIME_ZONE}
        />
      </div>
    </DirectionalTransition>
  )
}
