"use client"

import { useState } from "react"
import { toast } from "sonner"
import { DownloadIcon, ExternalLinkIcon, FileIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { getTaskFileUrl } from "../actions/get-task-file-url"
import { formatFileSize } from "../lib/format-file-size"
import type { TaskSubmissionFile } from "../types"

/** Types a browser can show inline; everything else (Office) is download-only. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"])

interface TaskSubmittedFilesProps {
  files: TaskSubmissionFile[]
  /** Graders get an "Abrir" button for PDFs/images besides the download. */
  allowOpen?: boolean
}

/** Submitted files with short-lived download/open links, minted per click by `getTaskFileUrl`. */
export function TaskSubmittedFiles({ files, allowOpen = false }: TaskSubmittedFilesProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const copy = taskSubmissionMessages.grading

  async function openFile(file: TaskSubmissionFile, wantsDownload: boolean) {
    // Opened synchronously so the popup blocker treats it as user-initiated.
    // If it was blocked anyway, fall back to a download instead of navigating
    // this page away to the file.
    const tab = wantsDownload ? null : window.open("", "_blank")
    if (tab) {
      tab.opener = null
    }
    const download = wantsDownload || !tab
    setBusyId(file.id)

    try {
      const result = await getTaskFileUrl({ fileId: file.id, download })
      if (!result.ok) {
        tab?.close()
        toast.error(result.message)
        return
      }
      if (tab) {
        tab.location.href = result.data.url
      } else {
        window.location.assign(result.data.url)
      }
    } catch {
      tab?.close()
      toast.error(taskSubmissionMessages.errors.UNKNOWN)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.filename}</span>
          <span className="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
          {allowOpen && INLINE_TYPES.has(file.mimeType) && (
            <Button size="sm" variant="ghost" disabled={busyId === file.id} onClick={() => openFile(file, false)}>
              <ExternalLinkIcon /> {copy.open}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busyId === file.id} onClick={() => openFile(file, true)}>
            <DownloadIcon /> {copy.download}
          </Button>
        </li>
      ))}
    </ul>
  )
}
