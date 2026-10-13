import { z } from "zod"

/**
 * Single source of truth for content block `data` shapes (C7). Both the
 * editor form resolver (client) and the Server Action (server) validate
 * against this same union — the action re-validates `data` unconditionally
 * because the client payload is never trusted.
 *
 * QUIZ/TASK are not in this union: those blocks are created and edited by the
 * assessment wizard (`create_assessment_block`), which owns their assessment.
 */
export const youtubeBlockDataSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Id de video inválido."),
  title: z.string().trim().max(200).optional(),
})

export const richTextBlockDataSchema = z.object({
  html: z.string().min(1, "Escribí algún contenido."),
})

export const pdfBlockDataSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

export const imageBlockDataSchema = z.object({
  path: z.string().min(1),
  alt: z.string().trim().max(200).optional(),
})

export const externalLinkBlockDataSchema = z.object({
  // http(s) only: `javascript:` and `data:` URLs are valid to `url()` but are
  // script payloads, and React 19 throws outright on a `javascript:` href —
  // one stored link would break the page for everyone who opens the lesson.
  url: z
    .string()
    .trim()
    .url("Ingresá una URL válida.")
    .refine((value) => /^https?:\/\//i.test(value), "El enlace debe empezar con http:// o https://"),
  title: z.string().trim().min(1, "Ingresá un título.").max(200),
})

export const contentBlockDataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("YOUTUBE_VIDEO"), data: youtubeBlockDataSchema }),
  z.object({ type: z.literal("RICH_TEXT"), data: richTextBlockDataSchema }),
  z.object({ type: z.literal("PDF"), data: pdfBlockDataSchema }),
  z.object({ type: z.literal("IMAGE"), data: imageBlockDataSchema }),
  z.object({ type: z.literal("EXTERNAL_LINK"), data: externalLinkBlockDataSchema }),
])
export type ContentBlockData = z.infer<typeof contentBlockDataSchema>
export type DataBlockType = ContentBlockData["type"]
/** Blocks whose content is an assessment authored inline by the wizard. */
export type AssessmentBlockType = "QUIZ" | "TASK"
export type OfferableBlockType = DataBlockType | AssessmentBlockType

export function isAssessmentBlockType(type: OfferableBlockType): type is AssessmentBlockType {
  return type === "QUIZ" || type === "TASK"
}

export const createContentBlockSchema = z.object({
  lessonId: z.guid(),
  isRequired: z.boolean(),
  block: contentBlockDataSchema,
})
export type CreateContentBlockInput = z.infer<typeof createContentBlockSchema>

export const updateContentBlockSchema = z.object({
  blockId: z.guid(),
  isRequired: z.boolean(),
  block: contentBlockDataSchema,
})
export type UpdateContentBlockInput = z.infer<typeof updateContentBlockSchema>

export const deleteContentBlockSchema = z.object({ blockId: z.guid() })
export type DeleteContentBlockInput = z.infer<typeof deleteContentBlockSchema>

export const reorderContentBlocksSchema = z.object({
  lessonId: z.guid(),
  orderedIds: z.array(z.guid()).min(1),
})
export type ReorderContentBlocksInput = z.infer<typeof reorderContentBlocksSchema>

/** All 7 DB enum values. */
export const OFFERABLE_BLOCK_TYPES: OfferableBlockType[] = [
  "YOUTUBE_VIDEO",
  "RICH_TEXT",
  "PDF",
  "IMAGE",
  "EXTERNAL_LINK",
  "QUIZ",
  "TASK",
]
