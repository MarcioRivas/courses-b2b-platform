"use client"

import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentEditorData, AssessmentKind } from "../../types"
import { AssessmentStatusBadge } from "../assessment-status-badge"

interface WizardHeaderProps {
  kind: AssessmentKind
  data: AssessmentEditorData | null
  isPending: boolean
  onClose: () => void
}

/** Kind eyebrow, title (or "Nuevo …" before step 1 is saved), status and close. */
export function WizardHeader({ kind, data, isPending, onClose }: WizardHeaderProps) {
  const wizard = teachAssessmentMessages.wizard

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {teachAssessmentMessages.assessments.kinds[kind]}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{data?.title ?? wizard.newTitle[kind]}</h2>
          {data && <AssessmentStatusBadge status={data.status} />}
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onClose} title={wizard.close} disabled={isPending}>
        <XIcon className="size-4" />
      </Button>
    </div>
  )
}
