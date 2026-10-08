"use client"

import { useEffect, useRef, useState } from "react"
import { MaximizeIcon, MinimizeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import type { YouTubePlayer } from "@/lib/youtube/load-iframe-api"
import type { GateCheckpoint } from "../lib/checkpoint-gate"
import { useCheckpointPlayer, type CheckpointPlayerCallbacks } from "../hooks/use-checkpoint-player"

export interface SeekRequest {
  seconds: number
  play: boolean
  /** Changes on every request so the same target can be requested twice. */
  nonce: number
}

interface CheckpointVideoPlayerProps extends CheckpointPlayerCallbacks {
  videoId: string
  title?: string
  checkpoints: GateCheckpoint[]
  /** A quiz is open: the player is paused and hidden (never covered — YouTube embed policy). */
  hidden?: boolean
  seekRequest?: SeekRequest | null
  onReady?: (player: YouTubePlayer) => void
}

/**
 * YouTube player driven by the IFrame API, with the checkpoint gate and our
 * own fullscreen (a fixed full-viewport container). Nothing is ever drawn on
 * top of the iframe: the controls live in a toolbar below it.
 */
export function CheckpointVideoPlayer({
  videoId,
  title,
  checkpoints,
  hidden = false,
  seekRequest,
  ...callbacks
}: CheckpointVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const copy = videoCheckpointMessages.student
  const { seek } = useCheckpointPlayer({ containerRef, videoId, checkpoints, locked: hidden, callbacks })

  useEffect(() => {
    if (seekRequest) seek(seekRequest.seconds, seekRequest.play)
    // `seek` is stable in behavior; only a new request (nonce) should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        fullscreen && "fixed inset-0 z-40 justify-center bg-black p-2",
        hidden && "hidden"
      )}
    >
      <div
        className={cn(
          // 200×200 is YouTube's minimum embed viewport.
          "aspect-video min-h-[200px] w-full min-w-[200px] overflow-hidden rounded-lg border bg-black",
          fullscreen && "mx-auto max-w-[calc((100dvh-4rem)*16/9)] rounded-none border-0"
        )}
      >
        <div ref={containerRef} className="size-full" title={title ?? "Video de YouTube"} />
      </div>
      <div className={cn("flex justify-end", fullscreen && "mx-auto w-full max-w-5xl")}>
        <Button
          type="button"
          size="sm"
          variant={fullscreen ? "secondary" : "outline"}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          {fullscreen ? copy.exitFullscreen : copy.fullscreen}
        </Button>
      </div>
    </div>
  )
}
