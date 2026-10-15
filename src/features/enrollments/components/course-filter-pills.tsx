"use client"

import { cn } from "@/lib/utils"

interface PillOption<T extends string> {
  value: T
  label: string
}

interface CourseFilterPillsProps<T extends string> {
  /** Accessible name of the group ("Mostrar"). */
  label: string
  options: PillOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** Toggle pills: one row, scrolls sideways on narrow screens instead of wrapping. */
export function CourseFilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: CourseFilterPillsProps<T>) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-9 shrink-0 cursor-pointer items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "border-transparent bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
