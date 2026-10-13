"use client"

import { CheckCircle2Icon, CircleXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { publishChecklist } from "../../lib/publish-checklist"
import type { AssessmentEditorData } from "../../types"
import { PublishButton } from "../publish-button"
import { ExtendWindowDialog } from "../extend-window-dialog"

interface ReviewStepProps {
  data: AssessmentEditorData
  timeZone: string
  onBack: () => void
  onPublished: () => void
  onDone: () => void
}

/** Wizard step 3: summary + the publish checklist, then publish. */
export function ReviewStep({ data, timeZone, onBack, onPublished, onDone }: ReviewStepProps) {
  const labels = teachAssessmentMessages.review
  const s = labels.summary
  const kinds = teachAssessmentMessages.assessments.kinds
  const wizard = teachAssessmentMessages.wizard
  const isPublished = data.status === "PUBLISHED"
  const date = (iso: string | null) => (iso ? formatDateTimeInTimeZone(iso, timeZone) : "—")

  const checks = publishChecklist({
    kind: data.kind,
    questionCount: data.questions.length,
    randomQuestionCount: data.randomQuestionCount,
    durationSeconds: data.durationSeconds,
    availableFrom: data.availableFrom,
    availableUntil: data.availableUntil,
    instructions: data.instructions,
  })
  const ready = checks.every((check) => check.ok)
  const points = data.questions.reduce((sum, q) => sum + q.points, 0)

  const rows: [string, string][] = [[s.kind, kinds[data.kind]]]
  if (data.kind === "TASK") {
    rows.push(
      [s.deadline, date(data.availableUntil)],
      [s.maxFiles, String(data.maxFiles ?? 1)],
      [s.late, data.allowLateSubmissions ? s.yes : s.no]
    )
  } else {
    rows.push([s.passingScore, `${data.passingScore ?? 60}%`])
    rows.push([
      s.questions,
      data.randomQuestionCount !== null
        ? s.randomOf(data.randomQuestionCount, data.questions.length)
        : teachAssessmentMessages.questionsEditor.summary(data.questions.length, points),
    ])
  }
  if (data.kind === "EXAM") {
    rows.push(
      [s.attempts, data.maxAttempts ? String(data.maxAttempts) : teachAssessmentMessages.assessments.unlimitedAttempts],
      [s.duration, data.durationSeconds ? s.minutes(Math.round(data.durationSeconds / 60)) : "—"],
      [s.window, `${date(data.availableFrom)} → ${date(data.availableUntil)}`]
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{isPublished ? labels.alreadyPublished : labels.intro}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
        <dt className="font-medium text-muted-foreground">{teachAssessmentMessages.assessments.titleLabel}</dt>
        <dd className="min-w-0 truncate">{data.title}</dd>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-medium text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{labels.checklistTitle}</h3>
        <ul className="flex flex-col gap-1.5">
          {checks.map((check) => (
            <li key={check.key} className="flex items-center gap-2 text-sm">
              {check.ok ? (
                <CheckCircle2Icon className="size-4 text-success" aria-hidden />
              ) : (
                <CircleXIcon className="size-4 text-destructive" aria-hidden />
              )}
              <span className={check.ok ? undefined : "text-destructive"}>{labels.checks[check.key]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          {wizard.back}
        </Button>
        {isPublished && data.kind === "EXAM" && (
          <ExtendWindowDialog assessmentId={data.id} currentUntil={data.availableUntil} timeZone={timeZone} onExtended={onPublished} />
        )}
        {!isPublished && ready && <PublishButton assessmentId={data.id} onPublished={onPublished} />}
        <Button type="button" variant={isPublished || !ready ? "default" : "outline"} onClick={onDone}>
          {wizard.done}
        </Button>
      </div>
    </div>
  )
}
