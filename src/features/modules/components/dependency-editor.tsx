"use client"

import { useEffect, useState, type ReactElement } from "react"
import { toast } from "sonner"
import { TrashIcon } from "lucide-react"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { listAssessmentsForBlock } from "@/features/assessments/actions/list-assessments-for-block"
import type { AssessmentPickerOption } from "@/features/assessments/types"
import { upsertDependency } from "../actions/upsert-dependency"
import { deleteDependency } from "../actions/delete-dependency"
import { DependencyConditionFields, type DependencyCondition } from "./dependency-condition-fields"

export interface ModuleDependencyItem {
  id: string
  condition: "MODULE_COMPLETED" | "QUIZ_PASSED"
  dependsOnModuleId: string | null
  assessmentId: string | null
  minScore: number | null
}

interface DependencyEditorProps {
  trigger: ReactElement
  courseId: string
  moduleId: string
  dependencies: ModuleDependencyItem[]
  otherModules: { id: string; title: string }[]
}

/** Both conditions are selectable since Phase 5 (D18/C9): MODULE_COMPLETED and QUIZ_PASSED. */
export function DependencyEditor({ trigger, courseId, moduleId, dependencies, otherModules }: DependencyEditorProps) {
  const [open, setOpen] = useState(false)
  const [condition, setCondition] = useState<DependencyCondition>("MODULE_COMPLETED")
  const [selectedModule, setSelectedModule] = useState<string | null>(otherModules[0]?.id ?? null)
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null)
  const [minScore, setMinScore] = useState("70")
  const [quizzes, setQuizzes] = useState<AssessmentPickerOption[]>([])
  const [pending, setPending] = useState(false)
  const labels = contentMessages.dependencies

  useEffect(() => {
    if (!open) return
    listAssessmentsForBlock(courseId, "QUIZ")
      .then((options) => {
        setQuizzes(options)
        setSelectedAssessment((current) => current ?? options[0]?.id ?? null)
      })
      .catch(() => toast.error(messages.errors.INTERNAL))
  }, [open, courseId])

  const titleFor = (id: string | null) => otherModules.find((m) => m.id === id)?.title ?? id ?? ""
  const quizTitleFor = (id: string | null) => quizzes.find((q) => q.id === id)?.title ?? id ?? ""

  function handleAdd() {
    setPending(true)
    const run = async () => {
      const result =
        condition === "MODULE_COMPLETED"
          ? selectedModule && (await upsertDependency({ condition, moduleId, dependsOnModuleId: selectedModule }))
          : selectedAssessment &&
            (await upsertDependency({ condition, moduleId, assessmentId: selectedAssessment, minScore: Number(minScore) }))

      setPending(false)
      if (!result) return
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.added)
    }
    void run()
  }

  function handleRemove(dependencyId: string) {
    setPending(true)
    deleteDependency({ dependencyId })
      .then((result) => {
        setPending(false)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        toast.success(labels.removed)
      })
      .catch(() => {
        setPending(false)
        toast.error(messages.errors.INTERNAL)
      })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        {dependencies.length === 0 ? (
          <EmptyState title={labels.emptyTitle} />
        ) : (
          <ul className="flex flex-col gap-2">
            {dependencies.map((dependency) => (
              <li key={dependency.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span>
                  {dependency.condition === "MODULE_COMPLETED"
                    ? `${labels.moduleCompletedLabel}: ${titleFor(dependency.dependsOnModuleId)}`
                    : `${labels.quizPassedLabel}: ${quizTitleFor(dependency.assessmentId)} (≥${dependency.minScore}%)`}
                </span>
                <Button variant="ghost" size="icon" disabled={pending} onClick={() => handleRemove(dependency.id)}>
                  <TrashIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DependencyConditionFields
          condition={condition}
          onConditionChange={setCondition}
          otherModules={otherModules}
          selectedModule={selectedModule}
          onSelectedModuleChange={setSelectedModule}
          quizzes={quizzes}
          selectedAssessment={selectedAssessment}
          onSelectedAssessmentChange={setSelectedAssessment}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          labels={labels}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {messages.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pending || (condition === "MODULE_COMPLETED" ? !selectedModule : !selectedAssessment)}
          >
            {pending ? messages.common.loading : labels.addAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
