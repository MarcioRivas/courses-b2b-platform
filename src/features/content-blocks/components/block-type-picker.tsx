"use client"

import type { LucideIcon } from "lucide-react"
import { FileTextIcon, ImageIcon, LinkIcon, ListChecksIcon, PenLineIcon, TypeIcon, VideoIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"
import { Button } from "@/components/ui/button"
import { OFFERABLE_BLOCK_TYPES, type OfferableBlockType } from "../schemas/content-block-schemas"

const ICONS: Record<OfferableBlockType, LucideIcon> = {
  YOUTUBE_VIDEO: VideoIcon,
  RICH_TEXT: TypeIcon,
  PDF: FileTextIcon,
  IMAGE: ImageIcon,
  EXTERNAL_LINK: LinkIcon,
  QUIZ: ListChecksIcon,
  TASK: PenLineIcon,
}

/** All 7 block types, QUIZ/TASK included since Phase 5 (requirement 5). */
export function BlockTypePicker({ onSelect }: { onSelect: (type: OfferableBlockType) => void }) {
  const labels = contentMessages.blocks.typePicker

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{labels.title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OFFERABLE_BLOCK_TYPES.map((type) => {
          const Icon = ICONS[type]
          return (
            <Button key={type} type="button" variant="outline" className="h-auto flex-col gap-1.5 py-3" onClick={() => onSelect(type)}>
              <Icon className="size-5" />
              <span className="text-xs">{labels[type]}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
