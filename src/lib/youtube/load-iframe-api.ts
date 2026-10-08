/**
 * Minimal typing for the YouTube IFrame Player API members this app uses
 * (https://developers.google.com/youtube/iframe_api_reference). Declared
 * locally instead of adding a types package for a handful of methods.
 */
export interface YouTubePlayer {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getPlaybackRate(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  destroy(): void
}

export interface YouTubePlayerOptions {
  host?: string
  videoId: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void
    onError?: (event: { data: number }) => void
  }
}

export interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer
  PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_SRC = "https://www.youtube.com/iframe_api"
const LOAD_TIMEOUT_MS = 15_000

let pending: Promise<YouTubeNamespace> | null = null

/**
 * Loads the IFrame API script once per page and resolves with `window.YT`.
 * Chains any handler already registered on `onYouTubeIframeAPIReady`; a
 * failure (blocked script, timeout) resets the singleton so a later mount
 * can retry.
 */
export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"))
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  pending ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const fail = (reason: string) => {
      pending = null
      document.querySelector(`script[src="${API_SRC}"]`)?.remove()
      reject(new Error(reason))
    }
    const timer = window.setTimeout(() => fail("YouTube API load timed out"), LOAD_TIMEOUT_MS)

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      window.clearTimeout(timer)
      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        fail("YouTube API missing after ready")
      }
    }

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement("script")
      script.src = API_SRC
      script.async = true
      script.onerror = () => {
        window.clearTimeout(timer)
        // Remove the failed tag so a later mount re-requests the script.
        script.remove()
        fail("YouTube API script failed to load")
      }
      document.head.appendChild(script)
    }
  })

  return pending
}
