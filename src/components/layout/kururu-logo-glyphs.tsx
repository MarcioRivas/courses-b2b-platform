import type { SVGProps } from "react"

/**
 * Kururu brand glyphs, drawn with round monoline strokes in `currentColor`.
 * Keep in sync with the static files in `public/brand/` and `src/app/icon.svg`.
 */

/** The mark: a "k" kicking a ball. 24×24 grid, sized like a lucide icon. */
export function KururuMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <g stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.4 4v16M6.4 15l7-6M9 12.8L14.4 20" />
      </g>
      <circle cx="16.9" cy="6.2" r="2.1" fill="currentColor" />
    </svg>
  )
}

/** The "kururu" wordmark (lowercase monoline). Height drives the size; width follows. */
export function KururuWordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 2 93 30" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2 4v26M2 24l9-8M5.5 21.5L11 30M17 16v8a6 6 0 0 0 12 0M29 16v14M35 30v-8a6 6 0 0 1 6-6h2M48 16v8a6 6 0 0 0 12 0M60 16v14M66 30v-8a6 6 0 0 1 6-6h2M79 16v8a6 6 0 0 0 12 0M91 16v14"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
