import Link from "next/link"
import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourse, getCourseProfessors } from "@/features/courses/queries/get-course"
import { listAssignableProfessors } from "@/features/courses/queries/list-assignable-professors"
import { CourseProfessorsPanel } from "@/features/courses/components/course-professors-panel"

interface CourseProfessorsPageProps {
  params: Promise<{ courseId: string }>
}

const TABS = [
  { key: "detalle", label: courseMessages.detail.detailTab, segment: "" },
  { key: "profesores", label: courseMessages.detail.professorsTab, segment: "professors" },
  { key: "ediciones", label: courseMessages.detail.offeringsTab, segment: "offerings" },
  { key: "contenido", label: courseMessages.detail.contentTab, segment: "content" },
] as const

export default async function CourseProfessorsPage({ params }: CourseProfessorsPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId } = await params

  const course = await getCourse(courseId)
  if (!course || course.organizationId !== ctx.organizationId) {
    return notFound()
  }

  const basePath = `/admin/courses/${courseId}`
  const [professors, assignableProfessors] = await Promise.all([
    getCourseProfessors(courseId),
    listAssignableProfessors({ organizationId: ctx.organizationId, courseId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={course.title} />

      <nav className="flex gap-1 border-b" aria-label={courseMessages.detail.professorsTab}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.segment ? `${basePath}/${tab.segment}` : basePath}
            aria-current={tab.key === "profesores" ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab.key === "profesores"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <CourseProfessorsPanel courseId={courseId} professors={professors} assignableProfessors={assignableProfessors} />
    </div>
  )
}
