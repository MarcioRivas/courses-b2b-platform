"use client"

import { useState } from "react"
import { ImageIcon } from "lucide-react"
import { uploadCourseFile } from "@/lib/storage/upload-course-file"
import { contentMessages } from "@/lib/messages/admin-content"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ImageBlockData } from "../lib/block-editor-types"

interface ImageEditorProps {
  organizationId: string
  courseId: string
  offeringId: string
  value: ImageBlockData
  onChange: (value: ImageBlockData) => void
  errors?: Record<string, string>
}

export function ImageEditor({ organizationId, courseId, offeringId, value, onChange, errors }: ImageEditorProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setUploadError(null)

    const result = await uploadCourseFile({ organizationId, courseId, offeringId, file })

    setUploading(false)
    if (!result.ok || !result.path) {
      setUploadError(
        result.errorCode === "TOO_LARGE"
          ? contentMessages.upload.tooLarge
          : result.errorCode === "INVALID_TYPE"
            ? contentMessages.upload.invalidType
            : contentMessages.upload.failed
      )
      return
    }

    onChange({ ...value, path: result.path })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-file">{contentMessages.blocks.image.fileLabel}</Label>
        {value.path && (
          <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value.path.split("/").pop()}</span>
          </div>
        )}
        <input
          id="image-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {uploading && <p className="text-sm text-muted-foreground">{contentMessages.blocks.image.uploading}</p>}
        {(uploadError || errors?.path) && (
          <p className="text-sm text-destructive">{uploadError ?? errors?.path ?? contentMessages.blocks.image.noFile}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-alt">{contentMessages.blocks.image.altLabel}</Label>
        <Input id="image-alt" value={value.alt ?? ""} onChange={(e) => onChange({ ...value, alt: e.target.value })} />
      </div>
    </div>
  )
}
