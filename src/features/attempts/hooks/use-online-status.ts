"use client"

import { useSyncExternalStore } from "react"

// Module-level cache, not `navigator.onLine` re-read on every snapshot: jsdom
// (and some browsers) don't flip `navigator.onLine` just because an
// `online`/`offline` event fired, so the snapshot must be driven by the event
// itself to stay testable and correct.
let cachedIsOnline = typeof navigator === "undefined" ? true : navigator.onLine

function subscribe(onStoreChange: () => void): () => void {
  function handleOnline() {
    cachedIsOnline = true
    onStoreChange()
  }
  function handleOffline() {
    cachedIsOnline = false
    onStoreChange()
  }

  window.addEventListener("online", handleOnline)
  window.addEventListener("offline", handleOffline)
  return () => {
    window.removeEventListener("online", handleOnline)
    window.removeEventListener("offline", handleOffline)
  }
}

function getSnapshot(): boolean {
  return cachedIsOnline
}

/** SSR has no network state — assume online so the first paint never shows a false offline banner (L5). */
function getServerSnapshot(): boolean {
  return true
}

/**
 * Tracks `navigator.onLine`, kept in sync via the `online`/`offline` window
 * events (§53 offline detection). `useSyncExternalStore` (rather than
 * `useState` seeded from `navigator.onLine`) avoids a hydration mismatch: the
 * server snapshot is always `true`, matching what SSR/the first client render
 * produce, then React reconciles to the real value right after mount.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
