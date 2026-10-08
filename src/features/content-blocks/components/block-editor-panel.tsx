"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { contentMessages } from "@/lib/messages/admin-content"
import { messages } from "@/lib/messages/es"
import { createBlock } from "../actions/create-block"
import { updateBlock } from "../actions/update-block"
import { contentBlockDataSchema, type ContentBlockData, type OfferableBlockType } from "../schemas/content-block-schemas"
import { defaultBlockData } from "../lib/block-editor-types"
import { BlockTypePicker } from "./block-type-picker"
import { YoutubeEditor } from "../editors/youtube-editor"
import { RichTextEditor } from "../editors/rich-text-editor"
import { PdfEditor } from "../editors/pdf-editor"
import { ImageEditor } from "../editors/image-editor"
import { LinkEditor } from "../editors/link-editor"
import { AssessmentBlockEditor } from "../editors/assessment-block-editor"
import { VideoCheckpointsSection } from "@/features/video-checkpoints/components/video-checkpoints-section"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"

interface BlockEditorPanelProps {
  organizationId: string
  courseId: string
  offeringId: string
  lessonId: string
  existingBlock?: { id: string; type: OfferableBlockType; data: unknown; isRequired: boolean; checkpointCount?: number }
  onSaved: () => void
  onCancel: () => void
}

/** Client-only editing surface (requirement 1): the rest of the builder stays server-rendered. */
export function BlockEditorPanel({ organizationId, courseId, offeringId, lessonId, existingBlock, onSaved, onCancel }: BlockEditorPanelProps) {
  const [type, setType] = useState<OfferableBlockType | null>(existingBlock?.type ?? null)
  const [data, setData] = useState<Record<string, unknown>>(
    (existingBlock?.data as Record<string, unknown>) ?? {}
  )
  const [isRequired, setIsRequired] = useState(existingBlock?.isRequired ?? true)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const savedVideoId = (existingBlock?.data as { videoId?: string } | undefined)?.videoId
  const videoChanged =
    type === "YOUTUBE_VIDEO" && (existingBlock?.checkpointCount ?? 0) > 0 && data.videoId !== savedVideoId

  if (!type) {
    return (
      <BlockTypePicker
        onSelect={(picked) => {
          setType(picked)
          setData(defaultBlockData(picked))
        }}
      />
    )
  }

  function handleSave() {
    const candidate = { type, data } as ContentBlockData
    const parsed = contentBlockDataSchema.safeParse(candidate)

    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[issue.path.length - 1]
        if (typeof key === "string") errors[key] = issue.message
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      const result = existingBlock
        ? await updateBlock({ blockId: existingBlock.id, isRequired, block: parsed.data })
        : await createBlock({ lessonId, isRequired, block: parsed.data })

      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(contentMessages.blocks.saved)
      onSaved()
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      {type === "YOUTUBE_VIDEO" && (
        <YoutubeEditor value={data as never} onChange={setData} errors={fieldErrors} />
      )}
      {videoChanged && <p className="rounded-md bg-warning-soft p-2 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">{videoCheckpointMessages.editor.videoChangedWarning}</p>}
      {type === "RICH_TEXT" && <RichTextEditor value={data as never} onChange={setData} errors={fieldErrors} />}
      {type === "PDF" && (
        <PdfEditor organizationId={organizationId} courseId={courseId} offeringId={offeringId} value={data as never} onChange={setData} errors={fieldErrors} />
      )}
      {type === "IMAGE" && (
        <ImageEditor organizationId={organizationId} courseId={courseId} offeringId={offeringId} value={data as never} onChange={setData} errors={fieldErrors} />
      )}
      {type === "EXTERNAL_LINK" && <LinkEditor value={data as never} onChange={setData} errors={fieldErrors} />}
      {(type === "QUIZ" || type === "TASK") && (
        <AssessmentBlockEditor offeringId={offeringId} kind={type} value={data as never} onChange={setData} errors={fieldErrors} />
      )}

      <div className="flex items-center gap-2">
        <Checkbox id="is-required" checked={isRequired} onCheckedChange={(checked) => setIsRequired(checked === true)} />
        <Label htmlFor="is-required" className="font-normal">
          {contentMessages.blocks.isRequiredLabel}
        </Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {messages.common.cancel}
        </Button>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? messages.common.loading : messages.common.save}
        </Button>
      </div>

      {/* Checkpoints save on their own and need the block's id (and its saved video). */}
      {type === "YOUTUBE_VIDEO" && (
        <VideoCheckpointsSection blockId={existingBlock?.id} videoId={savedVideoId ?? ""} />
      )}
    </div>
  )
}
