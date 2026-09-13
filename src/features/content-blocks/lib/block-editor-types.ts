import type {
  assessmentBlockDataSchema,
  externalLinkBlockDataSchema,
  imageBlockDataSchema,
  pdfBlockDataSchema,
  richTextBlockDataSchema,
  youtubeBlockDataSchema,
  OfferableBlockType,
} from "../schemas/content-block-schemas"
import { z } from "zod"

export type YoutubeBlockData = z.infer<typeof youtubeBlockDataSchema>
export type RichTextBlockData = z.infer<typeof richTextBlockDataSchema>
export type PdfBlockData = z.infer<typeof pdfBlockDataSchema>
export type ImageBlockData = z.infer<typeof imageBlockDataSchema>
export type ExternalLinkBlockData = z.infer<typeof externalLinkBlockDataSchema>
export type AssessmentBlockData = z.infer<typeof assessmentBlockDataSchema>

/** Sensible empty starting point for a freshly picked block type. */
export function defaultBlockData(
  type: OfferableBlockType
): YoutubeBlockData | RichTextBlockData | PdfBlockData | ImageBlockData | ExternalLinkBlockData | AssessmentBlockData {
  switch (type) {
    case "YOUTUBE_VIDEO":
      return { videoId: "" }
    case "RICH_TEXT":
      return { html: "" }
    case "PDF":
      return { path: "", filename: "", sizeBytes: 0 }
    case "IMAGE":
      return { path: "" }
    case "EXTERNAL_LINK":
      return { url: "", title: "" }
    case "QUIZ":
    case "TASK":
      return { assessmentId: "" }
  }
}
