"use client"

import { FileTextIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"
import { useSignedUrl } from "../lib/use-signed-url"

interface PdfRendererProps {
  blockId: string
  data: { path: string; filename: string; sizeBytes: number }
}

export function PdfRenderer({ blockId, data }: PdfRendererProps) {
  const { url, error, loading } = useSignedUrl(blockId, data.path)

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
      <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{data.filename}</span>
      {loading && <span className="text-muted-foreground">{contentMessages.blocks.renderers.loadingFile}</span>}
      {error && <span className="text-destructive">{contentMessages.blocks.renderers.fileUnavailable}</span>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          {contentMessages.blocks.renderers.openPdf}
        </a>
      )}
    </div>
  )
}
