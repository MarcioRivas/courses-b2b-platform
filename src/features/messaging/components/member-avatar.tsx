import { cn } from "@/lib/utils"

/** Initials in a soft circle; decorative (the name is always rendered next to it). */
export function MemberAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <span
      aria-hidden="true"
      className={cn(
        // Same tones as the `brand` badge: above 4.5:1 in light and dark.
        "grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        className
      )}
    >
      {initials || "?"}
    </span>
  )
}
