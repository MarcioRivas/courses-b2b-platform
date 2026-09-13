import Link from "next/link"
import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { getAttemptForGrading } from "@/features/grading/queries/get-attempt-for-grading"
import { GradingPanel } from "@/features/grading/components/grading-panel"
import { teachGradingMessages } from "@/lib/messages/teach-grading"

interface TeachGradingAttemptPageProps {
  params: Promise<{ attemptId: string }>
}

/** Per-attempt grading screen (D15) — RLS scopes visibility, `notFound()` otherwise. */
export default async function TeachGradingAttemptPage({ params }: TeachGradingAttemptPageProps) {
  await requireOrgRole(["PROFESSOR"])
  const { attemptId } = await params

  const attempt = await getAttemptForGrading(attemptId)
  if (!attempt) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={teachGradingMessages.panel.title}>
        <Button variant="outline" size="sm" render={<Link href="/teach/grading" />}>
          {teachGradingMessages.panel.backToQueue}
        </Button>
      </PageHeader>
      <GradingPanel attempt={attempt} />
    </div>
  )
}
