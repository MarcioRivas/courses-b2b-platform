import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { learnMessages } from "@/lib/messages/learn"
import { listFreeCourses } from "@/features/enrollments/queries/list-free-courses"
import { FreeCourseCard } from "@/features/enrollments/components/free-course-card"

export default async function CatalogPage() {
  const ctx = await requireOrgRole(["STUDENT"])
  const courses = await listFreeCourses(ctx.organizationId, ctx.user.id)

  return (
    <>
      <PageHeader title={learnMessages.catalog.title} description={learnMessages.catalog.description}>
        <Link
          href="/learn"
          className="text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {learnMessages.catalog.backToCourses}
        </Link>
      </PageHeader>

      {courses.length === 0 ? (
        <EmptyState title={learnMessages.catalog.empty} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id} className="contents">
              <FreeCourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
