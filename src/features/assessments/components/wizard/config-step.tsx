"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { assessmentConfigSchema, type AssessmentConfigInput } from "../../schemas/assessment-schemas"
import { editorDataToConfigValues, emptyConfigValues } from "../../lib/assessment-config-values"
import type { AssessmentEditorData, AssessmentKind, AssessmentWizardContext } from "../../types"
import { WindowFields } from "../window-fields"
import { AllowLateField, MaxFilesField } from "../task-fields"

interface ConfigStepProps {
  kind: AssessmentKind
  context: AssessmentWizardContext
  data: AssessmentEditorData | null
  /** QUIZ/TASK blocks: show the block's "required" checkbox. */
  showRequired: boolean
  isPending: boolean
  onDirtyChange: (dirty: boolean) => void
  onSubmit: (config: AssessmentConfigInput, isRequired: boolean) => void
  onCancel: () => void
}

/** Wizard step 1: configuration only — no questions, no instructions. */
export function ConfigStep({ kind, context, data, showRequired, isPending, onDirtyChange, onSubmit, onCancel }: ConfigStepProps) {
  const labels = teachAssessmentMessages.assessments
  const wizard = teachAssessmentMessages.wizard
  const windowLocked = data?.status === "PUBLISHED" && kind === "EXAM"
  const [isRequired, setIsRequired] = useState(data?.isRequired ?? true)

  const form = useForm<AssessmentConfigInput>({
    resolver: zodResolver(assessmentConfigSchema),
    defaultValues: data
      ? editorDataToConfigValues(data, context.timeZone)
      : emptyConfigValues(kind, context.defaultPassingScore, context.timeZone),
  })

  const isDirty = form.formState.isDirty || isRequired !== (data?.isRequired ?? true)
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(values, isRequired))} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{wizard.configIntro[kind]}</p>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.titleLabel}</FormLabel>
              <FormControl>
                <Input {...field} autoFocus={!data} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.descriptionLabel}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="passingScore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.passingScoreLabel}</FormLabel>
                <FormControl>
                  <Input type="number" min="0" max="100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {kind === "EXAM" && (
            <FormField
              control={form.control}
              name="maxAttempts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{labels.maxAttemptsLabel}</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" placeholder={labels.unlimitedAttempts} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {kind === "TASK" && <MaxFilesField control={form.control} />}
        </div>

        <WindowFields control={form.control} kind={kind} disabled={windowLocked} />
        {windowLocked && <p className="text-xs text-muted-foreground">{labels.windowLockedHint}</p>}

        {kind === "TASK" && <AllowLateField control={form.control} />}

        {showRequired && (
          <div className="flex items-center gap-2">
            <Checkbox id="assessment-is-required" checked={isRequired} onCheckedChange={(checked) => setIsRequired(checked === true)} />
            <Label htmlFor="assessment-is-required" className="font-normal">
              {contentMessages.blocks.isRequiredLabel}
            </Label>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? messages.common.loading : data && !isDirty ? wizard.next : wizard.saveAndContinue}
          </Button>
        </div>
      </form>
    </Form>
  )
}
