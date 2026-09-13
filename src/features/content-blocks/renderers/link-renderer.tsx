import { ExternalLinkIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"

interface LinkRendererProps {
  data: { url: string; title: string }
}

/** Rows predating the schema fix, or written directly, may still hold one. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export function LinkRenderer({ data }: LinkRendererProps) {
  if (!isHttpUrl(data.url)) {
    return <p className="text-sm text-muted-foreground">{data.title}</p>
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium text-primary hover:underline"
    >
      <ExternalLinkIcon className="size-4 shrink-0" />
      <span className="truncate">{data.title}</span>
      <span className="sr-only">{contentMessages.blocks.link.openAction}</span>
    </a>
  )
}
