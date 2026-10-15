"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { countPendingGrading } from "../lib/count-pending-grading"

/** New submissions arrive without any navigation; a minute is fresh enough for a sidebar hint. */
const POLL_MS = 60_000

/**
 * Live pending-grading count. Starts from the server's value; refetches on
 * every route change (e.g. back to the queue after saving a grade), when the
 * tab regains focus, and once a minute while visible. Only the newest request
 * writes state.
 */
export function usePendingGradingCount(initial: number): number {
  const [count, setCount] = useState(initial)
  const pathname = usePathname()
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    const next = await countPendingGrading(createClient())
    if (request === requestId.current) setCount(next)
  }, [])

  const lastPathname = useRef(pathname)
  useEffect(() => {
    if (pathname === lastPathname.current) return
    lastPathname.current = pathname
    void refresh()
  }, [pathname, refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, POLL_MS)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  return count
}
