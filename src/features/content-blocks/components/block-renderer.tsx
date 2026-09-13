import { Badge } from "@/components/ui/badge"
import type { Database, Json } from "@/types/database.types"
import { YoutubeRenderer } from "../renderers/youtube-renderer"
import { RichTextRenderer } from "../renderers/rich-text-renderer"
import { PdfRenderer } from "../renderers/pdf-renderer"
import { ImageRenderer } from "../renderers/image-renderer"
import { LinkRenderer } from "../renderers/link-renderer"

export interface RenderableBlock {
  id: string
  /**
   * The full DB enum, not `OfferableBlockType` (`content-block-schemas.ts`):
   * that union only covers the five non-assessment types, and this dispatcher
   * also has to handle QUIZ/TASK for the builder preview (Phase 5, D33 — the
   * lesson player itself never reaches this branch, see `lesson-block.tsx`).
   */
  type: Database["public"]["Enums"]["content_block_type"]
  data: Json
}

/**
 * The single dispatcher from a stored block to its renderer, shared by the
 * builder preview and the student lesson player so a new block type is wired
 * in one place.
 *
 * The `as never` casts hand each renderer its own narrow shape: `data` is
 * `Json` in the database and only the type discriminant says which shape it
 * holds. The write path validates it (`content-block-schemas.ts`), and PDF and
 * IMAGE renderers additionally fail closed when the path does not resolve.
 */
export function BlockRenderer({ block }: { block: RenderableBlock }) {
  switch (block.type) {
    case "YOUTUBE_VIDEO":
      return <YoutubeRenderer data={block.data as never} />
    case "RICH_TEXT":
      return <RichTextRenderer data={block.data as never} />
    case "PDF":
      return <PdfRenderer blockId={block.id} data={block.data as never} />
    case "IMAGE":
      return <ImageRenderer blockId={block.id} data={block.data as never} />
    case "EXTERNAL_LINK":
      return <LinkRenderer data={block.data as never} />
    case "QUIZ":
    case "TASK":
      // Builder preview only: the real completion flow (options, timer,
      // grading) lives in the student player, not in this dispatcher.
      return (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Badge variant="outline">{block.type === "QUIZ" ? "Cuestionario" : "Tarea"}</Badge>
          <span className="text-muted-foreground">Evaluación vinculada a este bloque.</span>
        </div>
      )
  }
}
