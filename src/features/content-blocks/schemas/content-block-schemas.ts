import { z } from "zod"

/**
 * Single source of truth for content block `data` shapes (C7). Both the
 * editor form resolver (client) and the Server Action (server) validate
 * against this same union — the action re-validates `data` unconditionally
 * because the client payload is never trusted.
 *
 * QUIZ/TASK carry `{ assessmentId }` in `data` for validation purposes only:
 * the write path (`create-block`/`update-block`) copies it into the
 * `assessment_id` column and persists `data: {}` — the DB CHECK
 * (`type in ('QUIZ','TASK') = (assessment_id is not null)`) is keyed off the
 * column, not the JSON blob (Phase 5).
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

export const assessmentBlockDataSchema = z.object({
  assessmentId: z.string().uuid("Elegí una evaluación."),
})

export const contentBlockDataSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("YOUTUBE_VIDEO"), data: youtubeBlockDataSchema }),
  z.object({ type: z.literal("RICH_TEXT"), data: richTextBlockDataSchema }),
  z.object({ type: z.literal("PDF"), data: pdfBlockDataSchema }),
  z.object({ type: z.literal("IMAGE"), data: imageBlockDataSchema }),
  z.object({ type: z.literal("EXTERNAL_LINK"), data: externalLinkBlockDataSchema }),
  z.object({ type: z.literal("QUIZ"), data: assessmentBlockDataSchema }),
  z.object({ type: z.literal("TASK"), data: assessmentBlockDataSchema }),
])
export type ContentBlockData = z.infer<typeof contentBlockDataSchema>
export type OfferableBlockType = ContentBlockData["type"]

export const createContentBlockSchema = z.object({
  lessonId: z.string().uuid(),
  isRequired: z.boolean(),
  block: contentBlockDataSchema,
})
export type CreateContentBlockInput = z.infer<typeof createContentBlockSchema>

export const updateContentBlockSchema = z.object({
  blockId: z.string().uuid(),
  isRequired: z.boolean(),
  block: contentBlockDataSchema,
})
export type UpdateContentBlockInput = z.infer<typeof updateContentBlockSchema>

export const deleteContentBlockSchema = z.object({ blockId: z.string().uuid() })
export type DeleteContentBlockInput = z.infer<typeof deleteContentBlockSchema>

export const reorderContentBlocksSchema = z.object({
  lessonId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
})
export type ReorderContentBlocksInput = z.infer<typeof reorderContentBlocksSchema>

/** All 7 DB enum values (Phase 5 enables QUIZ/TASK). */
export const OFFERABLE_BLOCK_TYPES: OfferableBlockType[] = [
  "YOUTUBE_VIDEO",
  "RICH_TEXT",
  "PDF",
  "IMAGE",
  "EXTERNAL_LINK",
  "QUIZ",
  "TASK",
]
