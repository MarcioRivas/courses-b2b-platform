"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentPickerOption } from "@/features/assessments/types"

export type DependencyCondition = "MODULE_COMPLETED" | "QUIZ_PASSED"

interface DependencyConditionFieldsProps {
  condition: DependencyCondition
  onConditionChange: (condition: DependencyCondition) => void
  otherModules: { id: string; title: string }[]
  selectedModule: string | null
  onSelectedModuleChange: (id: string | null) => void
  quizzes: AssessmentPickerOption[]
  selectedAssessment: string | null
  onSelectedAssessmentChange: (id: string | null) => void
  minScore: string
  onMinScoreChange: (value: string) => void
  labels: {
    conditionLabel: string
    moduleCompletedLabel: string
    quizPassedLabel: string
    prerequisiteLabel: string
    noOtherModules: string
  }
}

/** Extracted from `DependencyEditor` (M5, kept the parent under 200 lines): the condition type switch plus its module/quiz picker. */
export function DependencyConditionFields({
  condition,
  onConditionChange,
  otherModules,
  selectedModule,
  onSelectedModuleChange,
  quizzes,
  selectedAssessment,
  onSelectedAssessmentChange,
  minScore,
  onMinScoreChange,
  labels,
}: DependencyConditionFieldsProps) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <span className="text-sm font-medium">{labels.conditionLabel}</span>
      <Select value={condition} onValueChange={(value) => onConditionChange(value as DependencyCondition)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="MODULE_COMPLETED">{labels.moduleCompletedLabel}</SelectItem>
          <SelectItem value="QUIZ_PASSED">{labels.quizPassedLabel}</SelectItem>
        </SelectContent>
      </Select>

      {condition === "MODULE_COMPLETED" ? (
        otherModules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.noOtherModules}</p>
        ) : (
          <>
            <span className="text-sm font-medium">{labels.prerequisiteLabel}</span>
            <Select value={selectedModule ?? undefined} onValueChange={onSelectedModuleChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherModules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )
      ) : quizzes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{teachAssessmentMessages.dependency.pickerEmpty}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <span className="text-sm font-medium">{labels.prerequisiteLabel}</span>
            <Select value={selectedAssessment ?? undefined} onValueChange={onSelectedAssessmentChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quizzes.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24">
            <span className="text-sm font-medium">%</span>
            <Input type="number" min="0" max="100" value={minScore} onChange={(e) => onMinScoreChange(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )
}
