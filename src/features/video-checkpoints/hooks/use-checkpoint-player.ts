"use client"

import { useEffect, useRef, type RefObject } from "react"
import { loadYouTubeIframeApi, type YouTubePlayer } from "@/lib/youtube/load-iframe-api"
import {
  evaluateEnded,
  evaluateTick,
  initialMaxWatched,
  nextPending,
  skipTolerance,
  type GateCheckpoint,
} from "../lib/checkpoint-gate"

const TICK_MS = 250
const PLAYING = 1
const ENDED = 0
/** YouTube `onError` codes for "the owner does not allow embedding". */
const EMBED_BLOCKED = new Set([101, 150])

export interface CheckpointPlayerCallbacks {
  onCheckpointReached?: (checkpointId: string) => void
  onEnded?: () => void
  onError?: (kind: "embed" | "load") => void
  onReady?: (player: YouTubePlayer) => void
}

/**
 * Owns one YouTube player and enforces the checkpoint gate while it plays:
 * a 250 ms tick runs `evaluateTick` (pause at the next pending checkpoint,
 * undo forward skips), and any PLAYING while `locked` (a quiz is open) is
 * paused again. Callbacks are read through refs so re-renders never recreate
 * the player.
 */
export function useCheckpointPlayer(params: {
  containerRef: RefObject<HTMLDivElement | null>
  videoId: string
  checkpoints: GateCheckpoint[]
  locked: boolean
  callbacks: CheckpointPlayerCallbacks
}) {
  const { containerRef, videoId, checkpoints, locked, callbacks } = params
  const playerRef = useRef<YouTubePlayer | null>(null)
  const checkpointsRef = useRef(checkpoints)
  const lockedRef = useRef(locked)
  const callbacksRef = useRef(callbacks)
  const maxWatchedRef = useRef(initialMaxWatched(checkpoints))
  const lastTickRef = useRef(0)

  useEffect(() => {
    checkpointsRef.current = checkpoints
    lockedRef.current = locked
    callbacksRef.current = callbacks
  })

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const tick = () => {
      const player = playerRef.current
      const now = Date.now()
      const elapsed = lastTickRef.current ? now - lastTickRef.current : 0
      lastTickRef.current = now
      if (!player || player.getPlayerState() !== PLAYING) return
      const result = evaluateTick({
        time: player.getCurrentTime(),
        maxWatched: maxWatchedRef.current,
        next: nextPending(checkpointsRef.current),
        tolerance: skipTolerance(elapsed, player.getPlaybackRate?.() ?? 1),
      })
      maxWatchedRef.current = result.maxWatched
      if (result.action === "block-skip") {
        player.seekTo(result.seekTo, true)
      } else if (result.action === "pause-at-checkpoint") {
        player.pauseVideo()
        player.seekTo(result.seekTo, true)
        callbacksRef.current.onCheckpointReached?.(result.checkpointId)
      }
    }

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return
        const mount = document.createElement("div")
        containerRef.current.replaceChildren(mount)
        playerRef.current = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          // fs=0: YouTube's own fullscreen is replaced by ours, so the quiz can take over the screen.
          playerVars: { playsinline: 1, rel: 0, fs: 0 },
          events: {
            onReady: ({ target }) => callbacksRef.current.onReady?.(target),
            onStateChange: ({ data, target }) => {
              if (data === PLAYING && lockedRef.current) {
                target.pauseVideo()
              } else if (data === ENDED) {
                const ended = evaluateEnded({
                  maxWatched: maxWatchedRef.current,
                  duration: target.getDuration(),
                  next: nextPending(checkpointsRef.current),
                })
                if (ended.action === "block-skip") {
                  target.seekTo(ended.seekTo, true)
                  target.playVideo()
                } else if (ended.action === "open-quiz") {
                  callbacksRef.current.onCheckpointReached?.(ended.checkpointId)
                } else {
                  callbacksRef.current.onEnded?.()
                }
              }
            },
            onError: ({ data }) => callbacksRef.current.onError?.(EMBED_BLOCKED.has(data) ? "embed" : "load"),
          },
        })
        timer = window.setInterval(tick, TICK_MS)
      })
      .catch(() => {
        if (!cancelled) callbacksRef.current.onError?.("load")
      })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [containerRef, videoId])

  /** Seek (and optionally play) on the parent's request: resume after a pass, or rewind to a segment. */
  function seek(seconds: number, play: boolean) {
    const player = playerRef.current
    if (!player) return
    player.seekTo(seconds, true)
    if (play) player.playVideo()
  }

  return { seek }
}
