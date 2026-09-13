import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon, PlusIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { listAssessments } from "@/features/assessments/queries/list-assessments"
import { AssessmentList } from "@/features/assessments/components/assessment-list"

interface CourseAssessmentsPageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseAssessmentsPage({ params }: CourseAssessmentsPageProps) {
  await requireOrgRole(["PROFESSOR"])
  const { courseId } = await params

  if (!(await canEditCourse(courseId))) {
    return notFound()
  }

  const assessments = await listAssessments(courseId)
  const labels = teachAssessmentMessages.assessments

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/teach/courses/${courseId}/content`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {labels.backToCourseContent}
      </Link>

      <PageHeader title={labels.title}>
        <Button size="sm" render={<Link href={`/teach/courses/${courseId}/assessments/new`} />}>
          <PlusIcon className="size-4" /> {labels.addAction}
        </Button>
      </PageHeader>

      <AssessmentList courseId={courseId} assessments={assessments} />
    </div>
  )
}
