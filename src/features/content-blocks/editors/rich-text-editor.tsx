"use client"

import { useRef } from "react"
import { BoldIcon, ItalicIcon, LinkIcon, ListIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { RichTextBlockData } from "../lib/block-editor-types"

interface RichTextEditorProps {
  value: RichTextBlockData
  onChange: (value: RichTextBlockData) => void
  errors?: Record<string, string>
}

/**
 * Minimal formatting toolbar over a plain textarea (YAGNI — no rich-text
 * library, §92). Wraps the current selection with the tag; the server always
 * re-sanitizes on save regardless of what this produces.
 */
export function RichTextEditor({ value, onChange, errors }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function wrapSelection(open: string, close: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const { selectionStart, selectionEnd } = textarea
    const before = value.html.slice(0, selectionStart)
    const selected = value.html.slice(selectionStart, selectionEnd)
    const after = value.html.slice(selectionEnd)

    onChange({ html: `${before}${open}${selected}${close}${after}` })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="rich-text-content">{contentMessages.blocks.richText.contentLabel}</Label>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon" title={contentMessages.blocks.richText.bold} onClick={() => wrapSelection("<strong>", "</strong>")}>
          <BoldIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" title={contentMessages.blocks.richText.italic} onClick={() => wrapSelection("<em>", "</em>")}>
          <ItalicIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" title={contentMessages.blocks.richText.bulletList} onClick={() => wrapSelection("<ul>\n  <li>", "</li>\n</ul>")}>
          <ListIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" title={contentMessages.blocks.richText.link} onClick={() => wrapSelection('<a href="https://">', "</a>")}>
          <LinkIcon className="size-4" />
        </Button>
      </div>
      <Textarea
        id="rich-text-content"
        ref={textareaRef}
        rows={8}
        value={value.html}
        onChange={(e) => onChange({ html: e.target.value })}
      />
      {errors?.html && <p className="text-sm text-destructive">{errors.html}</p>}
    </div>
  )
}
