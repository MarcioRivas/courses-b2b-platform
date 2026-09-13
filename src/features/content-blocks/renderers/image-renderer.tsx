"use client"

import { contentMessages } from "@/lib/messages/admin-content"
import { useSignedUrl } from "../lib/use-signed-url"

interface ImageRendererProps {
  blockId: string
  data: { path: string; alt?: string }
}

export function ImageRenderer({ blockId, data }: ImageRendererProps) {
  const { url, error, loading } = useSignedUrl(blockId, data.path)

  if (loading) {
    return <p className="text-sm text-muted-foreground">{contentMessages.blocks.renderers.loadingFile}</p>
  }
  if (error || !url) {
    return <p className="text-sm text-destructive">{contentMessages.blocks.renderers.fileUnavailable}</p>
  }

  // eslint-disable-next-line @next/next/no-img-element -- signed URL is opaque/short-lived, not an optimizable static asset
  return <img src={url} alt={data.alt ?? ""} className="max-h-80 w-auto rounded-lg border object-contain" />
}
