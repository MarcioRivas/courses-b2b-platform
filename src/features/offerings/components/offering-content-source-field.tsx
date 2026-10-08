"use client"

import type { Control } from "react-hook-form"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import type { CreateOfferingInput } from "../schemas/offering-schemas"
import type { OfferingSourceOption } from "../types"

interface OfferingContentSourceFieldProps {
  control: Control<CreateOfferingInput>
  sources: OfferingSourceOption[]
  copyMode: boolean
  onCopyModeChange: (copy: boolean) => void
}

/** "Contenido" of a new edition: empty, or a copy of another edition of the course (only offered when one exists). */
export function OfferingContentSourceField({ control, sources, copyMode, onCopyModeChange }: OfferingContentSourceFieldProps) {
  const copy = offeringMessages.form.content
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{copy.label}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="content-source" checked={!copyMode} onChange={() => onCopyModeChange(false)} />
        {copy.empty}
      </label>
      {sources.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="content-source" checked={copyMode} onChange={() => onCopyModeChange(true)} />
          {copy.copy}
        </label>
      )}
      {copyMode && (
        <FormField
          control={control}
          name="fromOfferingId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.sourceLabel}</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={copy.sourcePlaceholder} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{copy.hint}</p>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </fieldset>
  )
}
