import { notFound } from "next/navigation"
import { PencilIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { getBank } from "@/features/questions/queries/get-bank"
import { listQuestions } from "@/features/questions/queries/list-questions"
import { BankForm } from "@/features/questions/components/bank-form"
import { QuestionList } from "@/features/questions/components/question-list"
import { Button } from "@/components/ui/button"

interface BankDetailPageProps {
  params: Promise<{ bankId: string }>
}

export default async function BankDetailPage({ params }: BankDetailPageProps) {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const { bankId } = await params

  const bank = await getBank(bankId)
  if (!bank || bank.organizationId !== ctx.organizationId) {
    return notFound()
  }

  const questions = await listQuestions(bankId)
  const labels = teachAssessmentMessages.banks

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={bank.name}
        description={bank.courseTitle ?? labels.courseOrgWideBadge}
        breadcrumb={[{ label: labels.title, href: "/teach/banks" }, { label: bank.name }]}
      >
        <BankForm
          mode="edit"
          courses={[]}
          bank={{ id: bank.id, name: bank.name, description: bank.description, courseId: bank.courseId }}
          trigger={
            <Button variant="outline" size="sm">
              <PencilIcon className="size-4" /> {teachAssessmentMessages.questions.title}
            </Button>
          }
        />
      </PageHeader>

      <QuestionList questionBankId={bankId} questions={questions} />
    </div>
  )
}
