import { BookOpenIcon, CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import type { CourseOutcome } from "../types"

export function TranscriptSummaryStats({ outcomes }: { outcomes: (CourseOutcome | null)[] }) {
  const count = (o: CourseOutcome) => outcomes.filter((x) => x === o).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={t.stats.courses} value={outcomes.length} icon={BookOpenIcon} tone="muted" />
      <StatCard label={t.stats.approved} value={count("APPROVED")} icon={CheckCircle2Icon} tone="success" />
      <StatCard label={t.stats.inProgress} value={count("IN_PROGRESS")} icon={CircleDashedIcon} tone="brand" />
      <StatCard label={t.stats.failed} value={count("FAILED")} icon={XCircleIcon} tone="secondary" />
    </div>
  )
}
