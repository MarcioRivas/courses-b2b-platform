"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentBankOption } from "../queries/get-assessment-config"

const NONE_VALUE = "__none__"

export interface RandomConfigValue {
  bankId: string | null
  count: number | null
}

interface RandomConfigFieldProps {
  banks: AssessmentBankOption[]
  value: RandomConfigValue
  onChange: (value: RandomConfigValue) => void
}

/** Bank + N picker (5B step 3): validated server-side against the bank's active question count on save/publish. */
export function RandomConfigField({ banks, value, onChange }: RandomConfigFieldProps) {
  const labels = teachAssessmentMessages.assessments.randomConfig
  const selectedBank = banks.find((b) => b.id === value.bankId)

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{labels.title}</p>
      <p className="text-sm text-muted-foreground">{labels.description}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>{labels.bankLabel}</Label>
          <Select
            value={value.bankId ?? NONE_VALUE}
            onValueChange={(bankId) => onChange(bankId === NONE_VALUE ? { bankId: null, count: null } : { bankId, count: value.count ?? 1 })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={labels.noneOption} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>{labels.noneOption}</SelectItem>
              {banks.map((bank) => (
                <SelectItem key={bank.id} value={bank.id}>
                  {bank.name} ({bank.activeQuestionCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {value.bankId && (
          <div className="flex w-32 flex-col gap-1.5">
            <Label>{labels.countLabel}</Label>
            <Input
              type="number"
              min="1"
              max={selectedBank?.activeQuestionCount ?? undefined}
              value={value.count ?? ""}
              onChange={(e) => onChange({ bankId: value.bankId, count: Number(e.target.value) || null })}
            />
          </div>
        )}
      </div>
      {selectedBank && value.count && value.count > selectedBank.activeQuestionCount && (
        <p className="text-sm text-destructive">{labels.countExceedsActive}</p>
      )}
    </div>
  )
}
