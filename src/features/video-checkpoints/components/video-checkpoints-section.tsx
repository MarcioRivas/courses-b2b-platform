"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { VideoCheckpointsEditor } from "./video-checkpoints-editor"
import { CheckpointStatsPanel } from "./checkpoint-stats-panel"

interface VideoCheckpointsSectionProps {
  /** Absent for a block that has not been saved yet: checkpoints need a block id. */
  blockId?: string
  videoId: string
}

/** "Preguntas en el video" inside the YouTube block editor: questions editor and statistics. */
export function VideoCheckpointsSection({ blockId, videoId }: VideoCheckpointsSectionProps) {
  const copy = videoCheckpointMessages.editor
  const [tab, setTab] = useState<"edit" | "stats">("edit")

  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{copy.title}</h3>
        {blockId && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={tab === "edit" ? "default" : "outline"} onClick={() => setTab("edit")}>
              {copy.editTab}
            </Button>
            <Button type="button" size="sm" variant={tab === "stats" ? "default" : "outline"} onClick={() => setTab("stats")}>
              {copy.statsTab}
            </Button>
          </div>
        )}
      </div>

      {!blockId ? (
        <p className="text-sm text-muted-foreground">{copy.saveBlockFirst}</p>
      ) : (
        <>
          {/* Kept mounted while viewing stats so unsaved drafts survive a tab switch. */}
          <div className={tab === "edit" ? undefined : "hidden"}>
            <VideoCheckpointsEditor blockId={blockId} videoId={videoId} active={tab === "edit"} />
          </div>
          {tab === "stats" && <CheckpointStatsPanel blockId={blockId} />}
        </>
      )}
    </section>
  )
}
