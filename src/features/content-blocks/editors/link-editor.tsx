"use client"

import { contentMessages } from "@/lib/messages/admin-content"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ExternalLinkBlockData } from "../lib/block-editor-types"

interface LinkEditorProps {
  value: ExternalLinkBlockData
  onChange: (value: ExternalLinkBlockData) => void
  errors?: Record<string, string>
}

export function LinkEditor({ value, onChange, errors }: LinkEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link-url">{contentMessages.blocks.link.urlLabel}</Label>
        <Input
          id="link-url"
          value={value.url}
          placeholder={contentMessages.blocks.link.urlPlaceholder}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
        />
        {errors?.url && <p className="text-sm text-destructive">{errors.url}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link-title">{contentMessages.blocks.link.titleLabel}</Label>
        <Input id="link-title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        {errors?.title && <p className="text-sm text-destructive">{errors.title}</p>}
      </div>
    </div>
  )
}
