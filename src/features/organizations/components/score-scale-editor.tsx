"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { settingsMessages } from "@/lib/messages/admin-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { upsertScoreRange } from "../actions/upsert-score-range"
import { deleteScoreRange } from "../actions/delete-score-range"
import { scoreRangeSchema, type ScoreRangeInput } from "../schemas/organization-schemas"
import { hasOverlappingRange } from "../score-range-overlap"
import { ScoreScalePreview } from "./score-scale-preview"
import type { ScoreRange } from "../types"

interface ScoreScaleEditorProps {
  ranges: ScoreRange[]
}

const EMPTY_RANGE: ScoreRangeInput = { label: "", minScore: 0, maxScore: 0, isPassing: false }

export function ScoreScaleEditor({ ranges }: ScoreScaleEditorProps) {
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const form = useForm<ScoreRangeInput>({ resolver: zodResolver(scoreRangeSchema), defaultValues: EMPTY_RANGE })

  function startEdit(range: ScoreRange) {
    setEditingId(range.id)
    form.reset({
      id: range.id,
      label: range.label,
      minScore: range.minScore,
      maxScore: range.maxScore,
      isPassing: range.isPassing,
    })
  }

  function startCreate() {
    setEditingId("new")
    form.reset(EMPTY_RANGE)
  }

  function onSubmit(values: ScoreRangeInput) {
    if (hasOverlappingRange(ranges, values)) {
      form.setError("maxScore", { message: settingsMessages.scoreScale.overlapError })
      return
    }
    startTransition(async () => {
      const result = await upsertScoreRange(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(messages.common.saved)
      setEditingId(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <ScoreScalePreview ranges={ranges} />

      <ul className="flex flex-col gap-2">
        {ranges.map((range) => (
          <li key={range.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">{range.label}</p>
              <p className="text-muted-foreground">
                {range.minScore}–{range.maxScore} · {range.isPassing ? messages.common.yes : messages.common.no}
              </p>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => startEdit(range)}>
                {messages.common.edit}
              </Button>
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    {messages.common.delete}
                  </Button>
                }
                title={settingsMessages.scoreScale.deleteTitle}
                description={settingsMessages.scoreScale.deleteDescription}
                confirmLabel={messages.common.delete}
                destructive
                action={deleteScoreRange}
                input={{ id: range.id }}
              />
            </div>
          </li>
        ))}
      </ul>

      {editingId ? (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem className="w-full sm:w-40">
                  <FormLabel>{settingsMessages.scoreScale.labelField}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="minScore"
              render={({ field }) => (
                <FormItem className="w-24">
                  <FormLabel>{settingsMessages.scoreScale.minField}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxScore"
              render={({ field }) => (
                <FormItem className="w-24">
                  <FormLabel>{settingsMessages.scoreScale.maxField}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPassing"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <FormLabel className="!mt-0">{settingsMessages.scoreScale.isPassingField}</FormLabel>
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? messages.common.loading : messages.common.save}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                {messages.common.cancel}
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <Button type="button" variant="outline" className="self-start" onClick={startCreate}>
          {settingsMessages.scoreScale.addAction}
        </Button>
      )}
    </div>
  )
}
