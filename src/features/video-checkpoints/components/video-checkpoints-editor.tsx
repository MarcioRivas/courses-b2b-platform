"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import type { YouTubePlayer } from "@/lib/youtube/load-iframe-api"
import { loadBlockCheckpoints } from "../actions/load-block-checkpoints"
import { saveVideoCheckpoints } from "../actions/save-video-checkpoints"
import { newCheckpoint, toDraft, toPayload, type DraftCheckpoint } from "../lib/checkpoint-draft"
import { CheckpointVideoPlayer, type SeekRequest } from "./checkpoint-video-player"
import { CheckpointCard } from "./checkpoint-card"

interface VideoCheckpointsEditorProps {
  blockId: string
  videoId: string
  /** False while the stats tab is shown: the (hidden) preview must not keep playing. */
  active: boolean
}

/**
 * "Preguntas en el video": a preview player (pause where you want a question,
 * then "Agregar pregunta en este momento") plus one card per checkpoint.
 * Saved separately from the block itself; ids are kept so edits preserve
 * student progress and statistics.
 */
export function VideoCheckpointsEditor({ blockId, videoId, active }: VideoCheckpointsEditorProps) {
  const copy = videoCheckpointMessages.editor
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [drafts, setDrafts] = useState<DraftCheckpoint[] | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null)
  const [isPending, startTransition] = useTransition()
  const [invalidTimes, setInvalidTimes] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!active) playerRef.current?.pauseVideo()
  }, [active])

  useEffect(() => {
    let cancelled = false
    loadBlockCheckpoints({ blockId }).then((result) => {
      if (!cancelled) setDrafts(result.ok ? toDraft(result.data) : [])
    })
    return () => {
      cancelled = true
    }
  }, [blockId])

  const sorted = [...(drafts ?? [])].sort((a, b) => a.atSeconds - b.atSeconds)

  function addAtCurrentTime() {
    const seconds = Math.max(1, Math.floor(playerRef.current?.getCurrentTime() ?? 1))
    if (sorted.some((checkpoint) => checkpoint.atSeconds === seconds)) {
      toast.error(videoCheckpointMessages.validation.timeDuplicate)
      return
    }
    playerRef.current?.pauseVideo()
    setDrafts([...(drafts ?? []), newCheckpoint(seconds)])
  }

  function save() {
    startTransition(async () => {
      const result = await saveVideoCheckpoints({ blockId, checkpoints: toPayload(drafts ?? []) })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(copy.saved)
      const reloaded = await loadBlockCheckpoints({ blockId })
      if (reloaded.ok) setDrafts(toDraft(reloaded.data))
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{copy.description}</p>

      <CheckpointVideoPlayer
        videoId={videoId}
        checkpoints={[]}
        seekRequest={seekRequest}
        onReady={(player) => {
          playerRef.current = player
          setDuration(Math.floor(player.getDuration()) || null)
        }}
      />

      <Button type="button" variant="outline" className="self-start" disabled={drafts === null} onClick={addAtCurrentTime}>
        <PlusIcon /> {copy.addAtCurrentTime}
      </Button>

      {drafts !== null && sorted.length === 0 && <EmptyState title={copy.emptyTitle} />}

      <ul className="flex flex-col gap-3">
        {sorted.map((checkpoint) => (
          <CheckpointCard
            key={checkpoint.key}
            checkpoint={checkpoint}
            durationSeconds={duration}
            takenTimes={sorted.filter((c) => c.key !== checkpoint.key).map((c) => c.atSeconds)}
            onChange={(updated) => setDrafts((current) => (current ?? []).map((c) => (c.key === updated.key ? updated : c)))}
            onRemove={() => {
              setDrafts((current) => (current ?? []).filter((c) => c.key !== checkpoint.key))
              setInvalidTimes((current) => new Set([...current].filter((key) => key !== checkpoint.key)))
            }}
            onGoTo={(seconds) => setSeekRequest({ seconds, play: false, nonce: Date.now() })}
            onTimeValidityChange={(valid) =>
              setInvalidTimes((current) => {
                const next = new Set(current)
                if (valid) next.delete(checkpoint.key)
                else next.add(checkpoint.key)
                return next
              })
            }
          />
        ))}
      </ul>

      <Button type="button" className="self-start" disabled={isPending || drafts === null || invalidTimes.size > 0} onClick={save}>
        {isPending ? copy.saving : copy.save}
      </Button>
    </section>
  )
}
