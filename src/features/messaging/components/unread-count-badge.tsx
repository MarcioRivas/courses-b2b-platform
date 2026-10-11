import { cn } from "@/lib/utils"

/**
 * Red unread counter (header icon, bubbles). Decorative: the control it sits
 * on carries the count in its accessible name. Renders nothing at zero.
 */
export function UnreadCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] leading-none font-semibold text-white ring-2 ring-background",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}
