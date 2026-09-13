import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { PageHeader } from "@/components/shared/page-header"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { NewAssessmentForm } from "@/features/assessments/components/new-assessment-form"

interface NewAssessmentPageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewAssessmentPage({ params }: NewAssessmentPageProps) {
  await requireOrgRole(["PROFESSOR"])
  const { courseId } = await params

  if (!(await canEditCourse(courseId))) {
    return notFound()
  }

  const labels = teachAssessmentMessages.assessments

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/teach/courses/${courseId}/assessments`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {labels.backToAssessments}
      </Link>
      <PageHeader title={labels.createTitle} />
      <NewAssessmentForm courseId={courseId} />
    </div>
  )
}
