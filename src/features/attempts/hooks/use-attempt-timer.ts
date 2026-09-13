"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { computeRemainingMs, timerWarningLevel, type TimerSync, type TimerWarningLevel } from "../lib/compute-remaining"
import type { AttemptSync } from "../types"

function toSync(input: { serverNow: string; effectiveEndAt: string | null }): TimerSync {
  return {
    serverNow: new Date(input.serverNow).getTime(),
    effectiveEndAt: input.effectiveEndAt ? new Date(input.effectiveEndAt).getTime() : null,
    syncedAtPerfNow: performance.now(),
  }
}

/**
 * The server owns time (§68): every RPC response resyncs `{serverNow,
 * effectiveEndAt}` here, and remaining time is always recomputed from that
 * pair plus a `performance.now()` delta — never `Date.now()`, which a skewed
 * device clock could use to fake more time.
 */
export function useAttemptTimer(
  initial: Pick<AttemptSync, "serverNow" | "effectiveEndAt">,
  onExpire: () => void
) {
  const [sync, setSync] = useState<TimerSync>(() => toSync(initial))
  const [remainingMs, setRemainingMs] = useState<number | null>(() => computeRemainingMs(sync, performance.now()))
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  const resync = useCallback((next: Pick<AttemptSync, "serverNow" | "effectiveEndAt">) => {
    expiredRef.current = false
    setSync(toSync(next))
  }, [])

  useEffect(() => {
    function tick() {
      const remaining = computeRemainingMs(sync, performance.now())
      setRemainingMs(remaining)
      if (remaining !== null && remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpireRef.current()
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [sync])

  const warningLevel: TimerWarningLevel = timerWarningLevel(remainingMs)

  return { remainingMs, warningLevel, resync }
}
