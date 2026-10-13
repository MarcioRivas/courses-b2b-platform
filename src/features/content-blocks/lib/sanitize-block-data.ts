import type { Json } from "@/types/database.types"
import type { ContentBlockData } from "../schemas/content-block-schemas"

/**
 * Runs the shared HTML sanitizer over RICH_TEXT payloads before they reach the
 * database (§92 — never persist unsanitized client HTML). Every other type
 * passes through unchanged; the schema already validated its shape.
 */
export function sanitizeBlockData(
  block: ContentBlockData,
  sanitizeHtml: (html: string) => string
): Json {
  if (block.type === "RICH_TEXT") {
    return { html: sanitizeHtml(block.data.html) } as unknown as Json
  }
  return block.data as unknown as Json
}
