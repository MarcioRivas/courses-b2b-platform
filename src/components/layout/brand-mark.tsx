import Link from "next/link"
import { cn } from "@/lib/utils"
import { APP_NAME } from "@/lib/constants"
import { KururuMarkIcon, KururuWordmark } from "./kururu-logo-glyphs"

type BrandMarkSize = "sm" | "md" | "lg"
type BrandMarkTone = "default" | "onDark"

interface BrandMarkProps {
  href?: string
  size?: BrandMarkSize
  /** `onDark` renders white text + translucent tile for gradient/dark surfaces. */
  tone?: BrandMarkTone
  /** Accessible name for the link (defaults to the visible app name). */
  ariaLabel?: string
  /** Tile only (collapsed sidebar); the app name stays as the accessible name. */
  iconOnly?: boolean
  className?: string
}

const TILE: Record<BrandMarkSize, string> = {
  sm: "size-7 rounded-lg [&>svg]:size-4.5",
  md: "size-8 rounded-xl [&>svg]:size-5",
  lg: "size-10 rounded-2xl [&>svg]:size-6.5",
}

const WORDMARK: Record<BrandMarkSize, string> = {
  sm: "h-4",
  md: "h-[18px]",
  lg: "h-5",
}

const TONE: Record<BrandMarkTone, { tile: string; text: string }> = {
  default: { tile: "bg-linear-to-br from-brand to-primary text-white", text: "text-foreground" },
  onDark: { tile: "bg-white/15 text-white ring-1 ring-white/20", text: "text-white" },
}

/** Gradient tile with the Kururu mark + wordmark. Server-safe; shared by app shell, auth and landing. */
export function BrandMark({
  href = "/",
  size = "md",
  tone = "default",
  ariaLabel,
  iconOnly = false,
  className,
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? (iconOnly ? APP_NAME : undefined)}
      className={cn(
        "flex items-center gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        TONE[tone].text,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center shadow-sm", TILE[size], TONE[tone].tile)}
      >
        <KururuMarkIcon />
      </span>
      {!iconOnly && (
        <>
          <KururuWordmark className={cn("w-auto", WORDMARK[size])} />
          <span className="sr-only">{APP_NAME}</span>
        </>
      )}
    </Link>
  )
}
