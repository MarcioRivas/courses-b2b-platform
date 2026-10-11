/**
 * Tactile landing cards: a 3px lift with a deeper shadow and a small icon
 * gesture on hover — no scale (avoids hover-scale-on-everything). `translate`
 * and `rotate` are separate properties in Tailwind v4, so they're listed by name.
 */
export const INTERACTIVE_CARD =
  "group rounded-2xl border bg-card p-6 shadow-card transition-[translate,box-shadow] duration-200 ease-out-quint hover:-translate-y-[3px] hover:shadow-lg"

export const CARD_ICON_TILE =
  "grid size-11 place-items-center rounded-xl transition-[rotate,translate] duration-200 ease-out-quint group-hover:-translate-y-0.5 group-hover:-rotate-6"

/** Icon tile tones rotate so grids read colourful without losing AA contrast. */
export const TILE_TONES = [
  "bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  "bg-warning-soft text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300",
  "bg-success-soft text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
] as const
