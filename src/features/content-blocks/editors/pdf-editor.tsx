"use client"

import { useState } from "react"
import { FileTextIcon } from "lucide-react"
import { uploadCourseFile } from "@/lib/storage/upload-course-file"
import { contentMessages } from "@/lib/messages/admin-content"
import { Label } from "@/components/ui/label"
import type { PdfBlockData } from "../lib/block-editor-types"

interface PdfEditorProps {
  organizationId: string
  courseId: string
  value: PdfBlockData
  onChange: (value: PdfBlockData) => void
  errors?: Record<string, string>
}

export function PdfEditor({ organizationId, courseId, value, onChange, errors }: PdfEditorProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setUploadError(null)

    const result = await uploadCourseFile({ organizationId, courseId, file })

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

    onChange({ path: result.path, filename: file.name, sizeBytes: file.size })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="pdf-file">{contentMessages.blocks.pdf.fileLabel}</Label>
      {value.filename && (
        <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{value.filename}</span>
        </div>
      )}
      <input
        id="pdf-file"
        type="file"
        accept="application/pdf"
        disabled={uploading}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      {uploading && <p className="text-sm text-muted-foreground">{contentMessages.blocks.pdf.uploading}</p>}
      {(uploadError || errors?.path) && (
        <p className="text-sm text-destructive">{uploadError ?? errors?.path ?? contentMessages.blocks.pdf.noFile}</p>
      )}
    </div>
  )
}
