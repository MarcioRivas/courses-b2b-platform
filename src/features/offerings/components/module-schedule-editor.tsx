"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/shared/empty-state"
import { upsertModuleSchedule } from "../actions/upsert-module-schedule"
import { utcIsoToLocalDateTimeInput } from "../lib/local-datetime"
import type { ModuleScheduleRow } from "../types"

interface ModuleScheduleEditorProps {
  offeringId: string
  rows: ModuleScheduleRow[]
  timeZone: string
}

/** One row per course module: independent (offering_id, module_id) upsert — two offerings never share a schedule row. */
export function ModuleScheduleEditor({ offeringId, rows, timeZone }: ModuleScheduleEditorProps) {
  if (rows.length === 0) {
    return <EmptyState title={offeringMessages.schedule.emptyModules} />
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{offeringMessages.schedule.description}</p>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <ScheduleRow key={row.moduleId} offeringId={offeringId} row={row} timeZone={timeZone} />
        ))}
      </div>
    </div>
  )
}

function ScheduleRow({
  offeringId,
  row,
  timeZone,
}: {
  offeringId: string
  row: ModuleScheduleRow
  timeZone: string
}) {
  const [availableFrom, setAvailableFrom] = useState(utcIsoToLocalDateTimeInput(row.availableFrom, timeZone))
  const [availableUntil, setAvailableUntil] = useState(utcIsoToLocalDateTimeInput(row.availableUntil, timeZone))
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await upsertModuleSchedule({
        offeringId,
        moduleId: row.moduleId,
        availableFrom,
        availableUntil,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(offeringMessages.schedule.saved)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex-1 text-sm font-medium">{row.moduleTitle}</div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{offeringMessages.schedule.fromLabel}</Label>
        <Input
          type="datetime-local"
          value={availableFrom}
          onChange={(e) => setAvailableFrom(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{offeringMessages.schedule.untilLabel}</Label>
        <Input
          type="datetime-local"
          value={availableUntil}
          onChange={(e) => setAvailableUntil(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>
      <Button size="sm" onClick={handleSave} disabled={isPending}>
        {isPending ? messages.common.loading : offeringMessages.schedule.saveRow}
      </Button>
    </div>
  )
}
