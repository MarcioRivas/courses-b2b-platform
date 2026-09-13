"use client"

import { useState, useTransition, type ReactElement } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createQuestion } from "../actions/create-question"
import { updateQuestion } from "../actions/update-question"
import { questionFormSchema, type QuestionFormInput } from "../schemas/question-schemas"
import { McOptionsEditor, type McOptionValue } from "./mc-options-editor"
import type { QuestionDetail, QuestionType } from "../types"

interface QuestionFormProps {
  trigger: ReactElement
  mode: "create" | "edit"
  questionBankId: string
  question?: QuestionDetail
}

const DEFAULT_OPTIONS: McOptionValue[] = [
  { label: "", isCorrect: true },
  { label: "", isCorrect: false },
]

export function QuestionForm({ trigger, mode, questionBankId, question }: QuestionFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.questions

  const [type, setType] = useState<QuestionType>(question?.type ?? "MULTIPLE_CHOICE")
  const [prompt, setPrompt] = useState(question?.prompt ?? "")
  const [defaultPoints, setDefaultPoints] = useState(String(question?.defaultPoints ?? 1))
  const [options, setOptions] = useState<McOptionValue[]>(
    question?.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })) ?? DEFAULT_OPTIONS
  )
  const [error, setError] = useState<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | undefined>(undefined)

  function handleSubmit() {
    const candidate: QuestionFormInput =
      type === "MULTIPLE_CHOICE"
        ? { type, prompt, defaultPoints: Number(defaultPoints), options }
        : { type, prompt, defaultPoints: Number(defaultPoints) }

    const parsed = questionFormSchema.safeParse(candidate)
    if (!parsed.success) {
      const optionsIssue = parsed.error.issues.find((issue) => issue.path[0] === "options")
      const otherIssue = parsed.error.issues.find((issue) => issue.path[0] !== "options")
      setOptionsError(optionsIssue?.message)
      setError(otherIssue?.message ?? null)
      return
    }
    setError(null)
    setOptionsError(undefined)

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createQuestion({ questionBankId, question: parsed.data })
          : await updateQuestion({ questionId: question!.id, question: parsed.data })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.saved)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? labels.createTitle : labels.editTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{labels.typeLabel}</Label>
            <Select value={type} onValueChange={(v) => setType(v as QuestionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MULTIPLE_CHOICE">{labels.types.MULTIPLE_CHOICE}</SelectItem>
                <SelectItem value="OPEN_ENDED">{labels.types.OPEN_ENDED}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{labels.promptLabel}</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{labels.pointsLabel}</Label>
            <Input type="number" min="0" step="0.5" value={defaultPoints} onChange={(e) => setDefaultPoints(e.target.value)} className="w-32" />
          </div>

          {type === "MULTIPLE_CHOICE" && (
            <McOptionsEditor options={options} onChange={setOptions} error={optionsError} />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? messages.common.loading : messages.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
