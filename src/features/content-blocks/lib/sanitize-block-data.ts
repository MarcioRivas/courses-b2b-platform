import type { Json } from "@/types/database.types"
import type { ContentBlockData } from "../schemas/content-block-schemas"

/**
 * Runs the shared HTML sanitizer over RICH_TEXT payloads before they reach the
 * database (§92 — never persist unsanitized client HTML). QUIZ/TASK persist
 * `{}` in `data` — their `assessmentId` is written to the `assessment_id`
 * column instead (`resolveBlockAssessmentId`, Phase 5). Every other type
 * passes through unchanged; the schema already validated its shape.
 */
export function sanitizeBlockData(
  block: ContentBlockData,
  sanitizeHtml: (html: string) => string
): Json {
  if (block.type === "RICH_TEXT") {
    return { html: sanitizeHtml(block.data.html) } as unknown as Json
  }
  if (block.type === "QUIZ" || block.type === "TASK") {
    return {} as unknown as Json
  }
  return block.data as unknown as Json
}

/** The `assessment_id` column value for a block: set for QUIZ/TASK, null otherwise (Phase 5). */
export function resolveBlockAssessmentId(block: ContentBlockData): string | null {
  if (block.type === "QUIZ" || block.type === "TASK") {
    return block.data.assessmentId
  }
  return null
}
