import { sanitizeHtml } from "@/lib/html/sanitize"

interface RichTextRendererProps {
  data: { html: string }
}

/**
 * Sanitized again at render time, not only before it was stored.
 *
 * The create/update actions sanitize, but they are not the only way a row can
 * be written: an editor with a session can PATCH `lesson_content_blocks`
 * directly through PostgREST, which never runs the action. Since this is the
 * point where the value would actually execute, it is the point that has to be
 * safe. `sanitizeHtml` is idempotent, so re-running it on already-clean markup
 * changes nothing.
 */
export function RichTextRenderer({ data }: RichTextRendererProps) {
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.html) }}
    />
  )
}
