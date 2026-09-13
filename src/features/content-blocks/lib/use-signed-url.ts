"use client"

import { useEffect, useState } from "react"
import { createSignedUrl } from "../actions/create-signed-url"

/**
 * Fetches a fresh 1h signed URL for a stored block file on mount. Never
 * cached beyond the component's lifetime — the URL is never persisted (D26).
 */
export function useSignedUrl(blockId: string, path: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    createSignedUrl({ blockId, path }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setUrl(result.data.url)
      } else {
        setError(true)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [blockId, path])

  return { url, error, loading }
}
