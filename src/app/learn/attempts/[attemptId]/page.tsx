import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { getAttempt } from "@/features/attempts/queries/get-attempt"
import { AttemptPlayer } from "@/features/attempts/components/attempt-player"
import { AttemptResult } from "@/features/attempts/components/attempt-result"

interface PageProps {
  params: Promise<{ attemptId: string }>
}

/**
 * RSC shell (5D step 12): loads `attempt_header` + `student_attempt_view`
 * server-side and either mounts the interactive player (`IN_PROGRESS`) or the
 * read-only result view (score resolved by `attempt_result`, no enrollment
 * id needed).
 */
export default async function AttemptPage({ params }: PageProps) {
  await requireOrgRole(["STUDENT"])
  const { attemptId } = await params

  const snapshot = await getAttempt(attemptId)
  if (!snapshot) {
    notFound()
  }

  if (snapshot.header.status !== "IN_PROGRESS") {
    return <AttemptResult snapshot={snapshot} />
  }

  return <AttemptPlayer attemptId={attemptId} initialSnapshot={snapshot} />
}
