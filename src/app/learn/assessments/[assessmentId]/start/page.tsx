import { notFound } from "next/navigation"
import { z } from "zod"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getEnrollment } from "@/features/enrollments/queries/get-enrollment"
import { getUnlockState } from "@/features/progress/queries/get-unlock-state"
import { getAssessmentPreflight } from "@/features/attempts/queries/get-assessment-preflight"
import { listMyAttempts } from "@/features/attempts/queries/list-my-attempts"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { AttemptError } from "@/features/attempts/components/attempt-error"
import { StartAttemptButton } from "@/features/attempts/components/start-attempt-button"
import type { AttemptErrorCode } from "@/features/attempts/lib/errors"

interface PageProps {
  params: Promise<{ assessmentId: string }>
  searchParams: Promise<{ enrollment?: string }>
}

/**
 * Pre-flight screen (5D step 11): the only entry point for `start_attempt`.
 * `?enrollment=` is required — without it there is no ownership context to
 * check, so a missing/invalid value 404s rather than guessing (cross-agent
 * route contract in the phase brief).
 */
export default async function AssessmentStartPage({ params, searchParams }: PageProps) {
  const ctx = await requireOrgRole(["STUDENT"])
  const { assessmentId } = await params
  const { enrollment: enrollmentIdParam } = await searchParams

  const parsedEnrollmentId = z.string().uuid().safeParse(enrollmentIdParam)
  if (!parsedEnrollmentId.success) {
    notFound()
  }
  const enrollmentId = parsedEnrollmentId.data

  const [enrollment, assessment, settings, unlockStates] = await Promise.all([
    getEnrollment(enrollmentId),
    getAssessmentPreflight(assessmentId),
    getOrgSettings(ctx.organizationId),
    getUnlockState(enrollmentId),
  ])

  if (!enrollment || !assessment || assessment.courseId !== enrollment.courseId) {
    notFound()
  }

  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const attempts = await listMyAttempts(enrollmentId)
  const own = attempts.find((row) => row.assessmentId === assessmentId)
  const attemptsUsed = own?.attemptsUsed ?? 0
  const maxAttempts = assessment.maxAttempts
  const inProgress = own?.lastStatus === "IN_PROGRESS"

  const copy = learnAssessmentMessages.preflight
  const now = new Date()
  const outsideWindow =
    (assessment.availableFrom !== null && now < new Date(assessment.availableFrom)) ||
    (assessment.availableUntil !== null && now > new Date(assessment.availableUntil))
  const limitReached = !inProgress && maxAttempts !== null && attemptsUsed >= maxAttempts
  const moduleState = assessment.moduleId
    ? unlockStates.find((state) => state.moduleId === assessment.moduleId)
    : undefined
  const moduleLocked = moduleState !== undefined && moduleState.state !== "AVAILABLE" && moduleState.state !== "COMPLETED"

  let blockedCode: AttemptErrorCode | null = null
  if (enrollment.closed) {
    blockedCode = "ASSESSMENT_NOT_AVAILABLE"
  } else if (!inProgress && outsideWindow) {
    blockedCode = "ASSESSMENT_EXPIRED"
  } else if (!inProgress && moduleLocked) {
    blockedCode = "MODULE_LOCKED"
  } else if (limitReached) {
    blockedCode = "ATTEMPT_LIMIT_REACHED"
  }

  return (
    <>
      <PageHeader title={assessment.title} description={assessment.description ?? undefined} />

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{learnAssessmentMessages.kind[assessment.kind]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Preguntas</dt>
            <dd>
              {assessment.randomQuestionCount !== null
                ? copy.questionCountLabel(assessment.randomQuestionCount)
                : copy.questionCountUnknown}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Duración</dt>
            <dd>
              {assessment.durationSeconds
                ? copy.durationLabel(Math.round(assessment.durationSeconds / 60))
                : copy.noDuration}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ventana</dt>
            <dd>
              {assessment.availableFrom || assessment.availableUntil ? (
                <>
                  {assessment.availableFrom &&
                    `${copy.windowFromPrefix} ${formatDateTimeInTimeZone(assessment.availableFrom, timeZone)} `}
                  {assessment.availableUntil &&
                    `${copy.windowUntilPrefix} ${formatDateTimeInTimeZone(assessment.availableUntil, timeZone)}`}
                </>
              ) : (
                copy.noWindow
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Intentos</dt>
            <dd>{copy.attemptsLabel(attemptsUsed, maxAttempts)}</dd>
          </div>
        </dl>

        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="mb-1 font-medium">{copy.rulesTitle}</p>
          <p>
            {assessment.kind === "QUIZ" ? copy.rulesQuiz : assessment.kind === "TASK" ? copy.rulesTask : copy.rulesExam}
          </p>
        </div>

        {inProgress && <p className="text-sm text-muted-foreground">{copy.inProgressNotice}</p>}

        {blockedCode ? (
          <AttemptError code={blockedCode} />
        ) : (
          <StartAttemptButton
            enrollmentId={enrollmentId}
            assessmentId={assessmentId}
            label={inProgress ? copy.continueAction : copy.startAction}
          />
        )}
      </div>
    </>
  )
}
