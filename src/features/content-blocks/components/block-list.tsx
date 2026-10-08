"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import type { Json } from "@/types/database.types"
import { reorderBlocks } from "../actions/reorder-blocks"
import { deleteBlock } from "../actions/delete-block"
import type { OfferableBlockType } from "../schemas/content-block-schemas"
import { BlockEditorPanel } from "./block-editor-panel"
import { BlockRenderer } from "./block-renderer"

export interface BlockListItem {
  id: string
  type: OfferableBlockType
  data: Json
  isRequired: boolean
  checkpointCount?: number
}

interface BlockListProps {
  organizationId: string
  courseId: string
  offeringId: string
  lessonId: string
  blocks: BlockListItem[]
  canEdit: boolean
}

export function BlockList({ organizationId, courseId, offeringId, lessonId, blocks, canEdit }: BlockListProps) {
  const [editing, setEditing] = useState<"new" | string | null>(null)
  const [isPending, startTransition] = useTransition()
  const labels = contentMessages.blocks

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return

    const orderedIds = blocks.map((b) => b.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target] as string, orderedIds[index] as string]

    startTransition(async () => {
      const result = await reorderBlocks({ lessonId, orderedIds })
      if (!result.ok) toast.error(result.message)
    })
  }

  if (editing === "new") {
    return (
      <BlockEditorPanel
        organizationId={organizationId}
        courseId={courseId}
        offeringId={offeringId}
        lessonId={lessonId}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const editingBlock = blocks.find((b) => b.id === editing)
  if (editingBlock) {
    return (
      <BlockEditorPanel
        organizationId={organizationId}
        courseId={courseId}
        offeringId={offeringId}
        lessonId={lessonId}
        existingBlock={editingBlock}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <Button type="button" size="sm" className="self-start" onClick={() => setEditing("new")}>
          <PlusIcon className="size-4" /> {labels.addAction}
        </Button>
      )}

      {blocks.length === 0 ? (
        <EmptyState title={labels.emptyTitle} />
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((block, index) => (
            <li key={block.id} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline">{labels.typePicker[block.type]}</Badge>
                  {block.isRequired && <Badge variant="secondary">{labels.isRequiredLabel}</Badge>}
                  {(block.checkpointCount ?? 0) > 0 && (
                    <Badge variant="brand">{videoCheckpointMessages.editor.builderBadge(block.checkpointCount ?? 0)}</Badge>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={index === 0 || isPending} onClick={() => move(index, -1)} title={labels.moveUp}>
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={index === blocks.length - 1 || isPending} onClick={() => move(index, 1)} title={labels.moveDown}>
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(block.id)} title={labels.editAction}>
                      <PencilIcon className="size-4" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" title={messages.common.delete}>
                          <TrashIcon className="size-4" />
                        </Button>
                      }
                      title={labels.deleteTitle}
                      description={labels.deleteDescription}
                      confirmLabel={messages.common.delete}
                      destructive
                      successMessage={labels.deleted}
                      action={deleteBlock}
                      input={{ blockId: block.id }}
                    />
                  </div>
                )}
              </div>
              <BlockRenderer block={block} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
