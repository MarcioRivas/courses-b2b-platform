import { Badge } from "@/components/ui/badge"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import type { TranscriptActivity } from "../types"

function describe(a: TranscriptActivity): string {
  const title = a.kind === "MODULE_COMPLETED" ? a.moduleTitle : (a.itemTitle ?? a.lessonTitle)
  return title ? `${t.history[a.kind]}: ${title}` : t.history[a.kind]
}

/** "Historial": what the student already did, newest first, with the date of each event. */
export function EnrollmentActivityTimeline({ activity, timeZone }: { activity: TranscriptActivity[]; timeZone: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{t.history.title}</h4>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.history.none}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {activity.map((a, i) => (
            <li key={`${a.kind}-${a.occurredAt}-${i}`} className="flex gap-3">
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                {formatDateInTimeZone(a.occurredAt, timeZone)}
              </span>
              <span className="min-w-0 flex-1">
                {describe(a)}
                {a.scoreLabel && <span className="text-muted-foreground"> · {a.scoreLabel}</span>}
              </span>
              {a.passed !== null && (
                <Badge variant={a.passed ? "success" : "destructive"}>
                  {a.passed ? t.assessments.passed : t.assessments.notPassed}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
