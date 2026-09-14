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
      className="rounded-md bg-amber-100 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {messages.connection.offline} — {messages.connection.offlineDescription}
    </p>
  )
}
