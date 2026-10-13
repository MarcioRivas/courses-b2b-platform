"use client"

import { useRouter } from "next/navigation"
import { createExam } from "../actions/create-exam"
import type { AssessmentEditorData, AssessmentWizardContext } from "../types"
import { AssessmentWizard, type WizardStepId } from "./wizard/assessment-wizard"

interface ExamWizardProps {
  offeringId: string
  examsPath: string
  context: AssessmentWizardContext
  initial: AssessmentEditorData | null
  initialStep?: WizardStepId
}

/** EXAM host for the assessment wizard: edition-level, no content block. */
export function ExamWizard({ offeringId, examsPath, context, initial, initialStep }: ExamWizardProps) {
  const router = useRouter()

  return (
    <AssessmentWizard
      kind="EXAM"
      offeringId={offeringId}
      context={context}
      initial={initial}
      initialStep={initialStep}
      showRequired={false}
      create={(config) => createExam({ offeringId, config })}
      // Hand over to the exam's own page (header with delete, reload-safe URL).
      onCreated={(assessmentId) => router.replace(`${examsPath}/${assessmentId}?step=content`)}
      onClose={() => router.push(examsPath)}
    />
  )
}
