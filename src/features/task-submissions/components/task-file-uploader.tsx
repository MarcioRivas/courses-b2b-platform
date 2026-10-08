"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import {
  MAX_TASK_FILE_BYTES,
  resolveTaskFileMimeType,
  TASK_FILE_ACCEPT,
} from "@/lib/storage/task-submission-file-path"
import { useTaskUpload } from "../hooks/use-task-upload"
import { formatFileSize } from "../lib/format-file-size"

interface TaskFileUploaderProps {
  assessmentId: string
  enrollmentId: string
  maxFiles: number
  /** A submission already exists: the button reads "Reemplazar" and asks for confirmation. */
  isReplacement: boolean
}

/** Picks up to `maxFiles` files, validates them locally, and submits (or replaces) the entrega. */
export function TaskFileUploader({ assessmentId, enrollmentId, maxFiles, isReplacement }: TaskFileUploaderProps) {
  const copy = taskSubmissionMessages.student
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { upload, progress, uploading } = useTaskUpload({ assessmentId, enrollmentId })

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? [])
    for (const file of picked) {
      if (file.size > MAX_TASK_FILE_BYTES) {
        toast.error(taskSubmissionMessages.validation.fileTooLarge(file.name))
        return
      }
      if (!resolveTaskFileMimeType(file.name)) {
        toast.error(taskSubmissionMessages.validation.fileTypeNotAllowed(file.name))
        return
      }
    }

    const next = maxFiles === 1 ? picked.slice(0, 1) : [...files, ...picked]
    if (next.length > maxFiles) {
      toast.error(taskSubmissionMessages.validation.tooManyFiles(maxFiles))
      return
    }
    setFiles(next)
  }

  async function send() {
    setConfirmOpen(false)
    const error = await upload(files)
    if (error) {
      toast.error(error)
      return
    }
    setFiles([])
    toast.success(copy.submitted)
  }

  const submitLabel = uploading
    ? progress && progress.total > 1
      ? copy.uploadProgress(progress.done, progress.total)
      : copy.submitting
    : isReplacement
      ? copy.replaceAction
      : copy.submitAction

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={TASK_FILE_ACCEPT}
        multiple={maxFiles > 1}
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ""
        }}
      />

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={copy.removeFile}
                disabled={uploading}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={uploading || (maxFiles > 1 && files.length >= maxFiles)}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon /> {maxFiles === 1 ? copy.pickFile : copy.pickFiles}
        </Button>
        <Button
          type="button"
          disabled={uploading || files.length === 0}
          onClick={() => (isReplacement ? setConfirmOpen(true) : send())}
        >
          {submitLabel}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.replaceConfirmTitle}</DialogTitle>
            <DialogDescription>{copy.replaceConfirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {copy.cancel}
            </Button>
            <Button onClick={send}>{copy.replaceConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
