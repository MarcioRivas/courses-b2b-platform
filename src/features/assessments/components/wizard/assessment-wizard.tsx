"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { Stepper } from "@/components/ui/stepper"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { ActionResult } from "@/lib/errors"
import { loadAssessmentWizard } from "../../actions/load-assessment-wizard"
import { updateAssessment } from "../../actions/update-assessment"
import { updateTaskInstructions } from "../../actions/update-task-instructions"
import { saveAssessmentQuestions } from "../../actions/save-assessment-questions"
import type { AssessmentConfigInput } from "../../schemas/assessment-schemas"
import type { AssessmentQuestionInput } from "../../schemas/assessment-question-schemas"
import type { AssessmentEditorData, AssessmentKind, AssessmentWizardContext } from "../../types"
import { WizardHeader } from "./wizard-header"
import { ConfigStep } from "./config-step"
import { QuestionsStep } from "./questions-step"
import { TaskInstructionsStep } from "./task-instructions-step"
import { ReviewStep } from "./review-step"

export type WizardStepId = "config" | "content" | "review"

interface AssessmentWizardProps {
  kind: AssessmentKind
  offeringId: string
  context: AssessmentWizardContext
  /** NULL = create mode: nothing exists until step 1 is saved. */
  initial: AssessmentEditorData | null
  initialStep?: WizardStepId
  /** Host-specific creation (block + assessment, or a bare EXAM). */
  create: (config: AssessmentConfigInput, isRequired: boolean) => Promise<ActionResult<{ assessmentId: string }>>
  onCreated?: (assessmentId: string) => void
  onClose: () => void
  showRequired: boolean
}

/**
 * Stepped authoring for any assessment: 1) configuration, 2) questions (QUIZ/
 * EXAM) or instructions (TASK), 3) review and publish. Each step saves on its
 * own; the stored row is re-read after every save so later steps always show
 * what the database holds.
 */
export function AssessmentWizard({ kind, offeringId, context, initial, initialStep, create, onCreated, onClose, showRequired }: AssessmentWizardProps) {
  const wizard = teachAssessmentMessages.wizard
  const [data, setData] = useState(initial)
  const [step, setStep] = useState<WizardStepId>(initial ? (initialStep ?? "config") : "config")
  const [isPending, setIsPending] = useState(false)
  const dirtyRef = useRef(false)
  /** Survives a failed reload after creation, so a retry never creates twice. */
  const createdIdRef = useRef<string | null>(null)
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])

  const steps = [
    { id: "config", label: wizard.steps.config },
    { id: "content", label: kind === "TASK" ? wizard.steps.instructions : wizard.steps.questions },
    { id: "review", label: wizard.steps.review },
  ]

  function confirmDiscard() {
    return !dirtyRef.current || window.confirm(wizard.unsavedConfirm)
  }

  function goTo(next: WizardStepId) {
    if (!confirmDiscard()) return
    dirtyRef.current = false
    setStep(next)
  }

  function close() {
    if (confirmDiscard()) onClose()
  }

  async function reload(assessmentId: string) {
    const loaded = await loadAssessmentWizard(offeringId, assessmentId)
    if (!loaded?.assessment) {
      toast.error(wizard.loadError)
      return false
    }
    setData(loaded.assessment)
    return true
  }

  /** Runs a save, re-reads the row on success; resolves to the action's data or null. */
  async function run<T>(action: () => Promise<ActionResult<T>>, assessmentId: string | null): Promise<T | null> {
    setIsPending(true)
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(result.message)
        return null
      }
      if (assessmentId && !(await reload(assessmentId))) return null
      return result.data
    } finally {
      setIsPending(false)
    }
  }

  async function handleConfig(config: AssessmentConfigInput, isRequired: boolean) {
    if (data && !dirtyRef.current) return goTo("content")

    if (!data) {
      if (!createdIdRef.current) {
        const created = await run(() => create(config, isRequired), null)
        if (!created) return
        createdIdRef.current = created.assessmentId
        toast.success(wizard.created)
        onCreated?.(created.assessmentId)
      }
      if (!(await reload(createdIdRef.current))) return
    } else {
      const saved = await run(() => updateAssessment({ assessmentId: data.id, config, isRequired: showRequired ? isRequired : undefined }), data.id)
      if (saved === null) return
      toast.success(wizard.saved)
    }
    dirtyRef.current = false
    setStep("content")
  }

  async function handleQuestions(questions: AssessmentQuestionInput[], randomCount: number | null) {
    if (!data) return null
    // Students can no longer start a published assessment with no questions.
    if (data.status === "PUBLISHED" && questions.length === 0) {
      toast.error(teachAssessmentMessages.errors.noQuestions)
      return null
    }
    const saved = await run(() => saveAssessmentQuestions({ assessmentId: data.id, questions, randomCount }), data.id)
    if (!saved) return null
    dirtyRef.current = false
    toast.success(teachAssessmentMessages.questionsEditor.saved)
    return saved.ids
  }

  async function handleInstructions(instructions: string) {
    if (!data) return false
    const saved = await run(() => updateTaskInstructions({ assessmentId: data.id, instructions }), data.id)
    if (saved === null) return false
    dirtyRef.current = false
    toast.success(wizard.saved)
    return true
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-5">
      <WizardHeader kind={kind} data={data} isPending={isPending} onClose={close} />

      <Stepper steps={steps} current={step} isEnabled={() => Boolean(data)} onSelect={(id) => goTo(id as WizardStepId)} />

      {data?.status === "PUBLISHED" && step !== "review" && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{wizard.publishedNote}</p>
      )}

      {step === "config" && (
        <ConfigStep
          kind={kind}
          context={context}
          data={data}
          showRequired={showRequired}
          isPending={isPending}
          onDirtyChange={onDirtyChange}
          onSubmit={handleConfig}
          onCancel={close}
        />
      )}
      {step === "content" && data && kind !== "TASK" && (
        <QuestionsStep
          data={data}
          isPending={isPending}
          onDirtyChange={onDirtyChange}
          onSave={handleQuestions}
          onBack={() => goTo("config")}
          onNext={() => goTo("review")}
        />
      )}
      {step === "content" && data && kind === "TASK" && (
        <TaskInstructionsStep
          initial={data.instructions ?? ""}
          isPending={isPending}
          onDirtyChange={onDirtyChange}
          onSave={handleInstructions}
          onBack={() => goTo("config")}
          onNext={() => goTo("review")}
        />
      )}
      {step === "review" && data && (
        <ReviewStep
          data={data}
          timeZone={context.timeZone}
          onBack={() => goTo("content")}
          onPublished={() => void reload(data.id)}
          onDone={close}
        />
      )}
    </div>
  )
}
