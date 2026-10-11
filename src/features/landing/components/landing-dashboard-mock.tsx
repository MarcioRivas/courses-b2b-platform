import type { CSSProperties } from "react"
import { TrendingUpIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { TILE_TONES } from "./landing-card-styles"

const { mock } = landingMessages.hero

/**
 * Purely decorative dashboard preview (hidden from assistive tech). It lands
 * into its tilt after the hero copy, then comes alive once: counters count up,
 * the bar fills and the delta badge pops. Reduced motion shows the final state.
 */
export function LandingDashboardMock() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-md animate-mock-land rounded-3xl border bg-card p-6 shadow-card rotate-1 md:rotate-2"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{mock.title}</p>
          <p className="text-xs text-muted-foreground">{mock.subtitle}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand to-primary text-white">
          <TrendingUpIcon className="size-4" />
        </span>
      </div>
      <ul className="mt-6 space-y-3">
        {mock.stats.map((stat, index) => (
          <li key={stat.label} className="flex items-center gap-3 rounded-2xl border bg-background p-3">
            <span
              className={`grid h-10 w-14 shrink-0 place-items-center rounded-xl text-sm font-semibold tabular-nums ${TILE_TONES[index % TILE_TONES.length]}`}
            >
              <span className="stat-counter" style={{ "--stat": stat.value } as CSSProperties}>
                {stat.suffix}
              </span>
            </span>
            <span className="flex-1 text-sm font-medium">{stat.label}</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {stat.delta}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{mock.progressLabel}</span>
          <span className="font-semibold text-sky-800 dark:text-sky-300">{mock.progressValue}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full origin-left animate-fill-in rounded-full bg-linear-to-r from-primary to-brand [animation-delay:500ms] [transform:scaleX(0.72)]" />
        </div>
      </div>
      <span className="absolute -top-3 -right-3 animate-reward-in rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground shadow-sm [animation-delay:900ms]">
        {mock.highlightDelta}
      </span>
    </div>
  )
}
