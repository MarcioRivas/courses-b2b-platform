import { messages } from "@/lib/messages/es"

interface OfflineBannerProps {
  isOnline: boolean
}

/** Connection-lost notice shown above the attempt player (§53). Extracted from `attempt-player.tsx` (L6, >200 lines). */
export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  if (isOnline) return null

  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-xl border border-yellow-300 bg-warning-soft p-3 text-sm font-medium text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
    >
      {messages.connection.offline} — {messages.connection.offlineDescription}
    </p>
  )
}
