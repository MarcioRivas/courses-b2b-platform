import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { listBanks } from "@/features/questions/queries/list-banks"
import { listProfessorCourses } from "@/features/courses/queries/list-professor-courses"
import { BankList } from "@/features/questions/components/bank-list"
import { BankForm } from "@/features/questions/components/bank-form"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"

export default async function TeachBanksPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const [banks, courses] = await Promise.all([
    listBanks(ctx.organizationId),
    listProfessorCourses(ctx.user.id),
  ])
  const labels = teachAssessmentMessages.banks

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={labels.title}>
        <BankForm
          mode="create"
          courses={courses.map((c) => ({ id: c.id, title: c.title }))}
          trigger={
            <Button size="sm">
              <PlusIcon className="size-4" /> {labels.addAction}
            </Button>
          }
        />
      </PageHeader>
      <BankList banks={banks} />
    </div>
  )
}
