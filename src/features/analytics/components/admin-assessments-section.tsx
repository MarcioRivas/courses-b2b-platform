import Link from "next/link"
import { StatsTable } from "./stats-table"
import { DistributionChart } from "./distribution-chart"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { AssessmentStatsRow, ScoreDistributionBucket } from "../types"

interface AdminAssessmentsSectionProps {
  assessments: AssessmentStatsRow[]
  selectedAssessmentId: string | null
  distribution: ScoreDistributionBucket[] | null
}

/**
 * Assessments section of the admin dashboard (`org_assessment_stats`), plus a
 * per-assessment score distribution chart selected via `?assessment=<uuid>`
 * (validated by the page — an unrecognized or forbidden id just renders no
 * chart instead of an error, matching every other analytics query's
 * "nothing to show" convention).
 */
export function AdminAssessmentsSection({
  assessments,
  selectedAssessmentId,
  distribution,
}: AdminAssessmentsSectionProps) {
  const m = analyticsMessages.admin.assessments
  const selected = assessments.find((assessment) => assessment.assessmentId === selectedAssessmentId) ?? null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.sectionTitle}</h2>
      <StatsTable
        items={assessments}
        getRowKey={(assessment) => assessment.assessmentId}
        titleColumn={{ key: "title", header: m.tableTitleHeader, cell: (assessment) => assessment.title }}
        columns={[
          { key: "course", header: m.course, cell: (assessment) => assessment.courseTitle },
          { key: "kind", header: m.kind, cell: (assessment) => analyticsMessages.assessmentKind[assessment.kind] },
          { key: "attempts", header: m.attempts, cell: (assessment) => assessment.attemptsCount },
          { key: "submitted", header: m.submitted, cell: (assessment) => assessment.submittedCount },
          { key: "graded", header: m.graded, cell: (assessment) => assessment.gradedCount },
          { key: "avgScore", header: m.avgScore, cell: (assessment) => formatPercent(assessment.avgScorePercent) },
          { key: "passed", header: m.passed, cell: (assessment) => assessment.passedCount },
          { key: "failed", header: m.failed, cell: (assessment) => assessment.failedCount },
          {
            key: "view",
            header: m.viewDistribution,
            isActions: true,
            cell: (assessment) => (
              <Link
                href={`/admin/analytics?assessment=${assessment.assessmentId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {m.viewDistribution}
              </Link>
            ),
          },
        ]}
        emptyTitle={m.emptyTitle}
      />
      {selected && distribution && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">{m.distributionTitle(selected.title)}</h3>
          <DistributionChart buckets={distribution} />
        </div>
      )}
    </section>
  )
}
