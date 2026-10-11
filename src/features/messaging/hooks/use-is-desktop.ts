"use client"

import { useSyncExternalStore } from "react"

/** Tailwind's `md` breakpoint: side-by-side windows and bubbles above it, one full-screen chat below. */
const DESKTOP_QUERY = "(min-width: 768px)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  )
}
