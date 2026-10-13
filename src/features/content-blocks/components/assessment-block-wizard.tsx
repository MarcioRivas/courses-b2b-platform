"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { loadAssessmentWizard } from "@/features/assessments/actions/load-assessment-wizard"
import { createAssessmentBlock } from "@/features/assessments/actions/create-assessment-block"
import { AssessmentWizard } from "@/features/assessments/components/wizard/assessment-wizard"
import type { AssessmentEditorData, AssessmentWizardContext } from "@/features/assessments/types"
import type { AssessmentBlockType } from "../schemas/content-block-schemas"

interface AssessmentBlockWizardProps {
  offeringId: string
  lessonId: string
  kind: AssessmentBlockType
  /** Set when editing an existing QUIZ/TASK block. */
  assessmentId?: string | null
  onClose: () => void
}

/**
 * QUIZ/TASK blocks are authored in place: the wizard creates the assessment
 * together with its block on step 1, then adds its questions / instructions.
 */
export function AssessmentBlockWizard({ offeringId, lessonId, kind, assessmentId, onClose }: AssessmentBlockWizardProps) {
  const [loaded, setLoaded] = useState<{ context: AssessmentWizardContext; assessment: AssessmentEditorData | null } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    loadAssessmentWizard(offeringId, assessmentId ?? undefined)
      .then((result) => {
        if (!active) return
        if (result) setLoaded(result)
        else setFailed(true)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [offeringId, assessmentId])

  if (failed) {
    return <p className="rounded-lg border p-4 text-sm text-destructive">{teachAssessmentMessages.wizard.loadError}</p>
  }
  if (!loaded) {
    return <Skeleton className="h-72 w-full rounded-lg" />
  }

  return (
    <AssessmentWizard
      kind={kind}
      offeringId={offeringId}
      context={loaded.context}
      initial={loaded.assessment}
      // Opening an existing block lands on its content, the usual thing to edit.
      initialStep={loaded.assessment ? "content" : "config"}
      showRequired
      create={async (config, isRequired) => {
        const result = await createAssessmentBlock({ lessonId, isRequired, config })
        return result.ok ? { ok: true, data: { assessmentId: result.data.assessmentId } } : result
      }}
      onClose={onClose}
    />
  )
}
