import type {
  externalLinkBlockDataSchema,
  imageBlockDataSchema,
  pdfBlockDataSchema,
  richTextBlockDataSchema,
  youtubeBlockDataSchema,
  DataBlockType,
} from "../schemas/content-block-schemas"
import { z } from "zod"

export type YoutubeBlockData = z.infer<typeof youtubeBlockDataSchema>
export type RichTextBlockData = z.infer<typeof richTextBlockDataSchema>
export type PdfBlockData = z.infer<typeof pdfBlockDataSchema>
export type ImageBlockData = z.infer<typeof imageBlockDataSchema>
export type ExternalLinkBlockData = z.infer<typeof externalLinkBlockDataSchema>

/** Sensible empty starting point for a freshly picked block type. */
export function defaultBlockData(
  type: DataBlockType
): YoutubeBlockData | RichTextBlockData | PdfBlockData | ImageBlockData | ExternalLinkBlockData {
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
  }
}
