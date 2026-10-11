"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { searchMembers } from "../lib/messaging-reads"
import { settleAction } from "../lib/settle-action"
import type { MessageableMember } from "../types"

const SEARCH_DEBOUNCE_MS = 300
export const MIN_SEARCH_CHARS = 2

/**
 * Debounced search of the org's members by name. `results` is null until the
 * first answer for the current query (or while the query is too short).
 */
export function useMemberSearch(query: string) {
  const trimmed = query.trim()
  const active = trimmed.length >= MIN_SEARCH_CHARS
  const [state, setState] = useState<{ query: string; results: MessageableMember[] } | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await settleAction(() => searchMembers(trimmed))
      if (cancelled) return
      if (!result.ok) toast.error(result.message)
      setState({ query: trimmed, results: result.ok ? result.data : [] })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, trimmed])

  const results = active && state?.query === trimmed ? state.results : null
  return { active, results }
}
