import Link from "next/link"
import { ArrowRightIcon, TrendingUpIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { landingMessages } from "@/lib/messages/landing"

const { hero } = landingMessages

const STAT_TONES = ["bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300", "bg-warning-soft text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300", "bg-success-soft text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"] as const

/** Purely decorative dashboard preview — divs only, hidden from assistive tech. */
function DashboardMock() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-md rotate-1 rounded-3xl border bg-card p-6 shadow-card md:rotate-2"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{hero.mock.title}</p>
          <p className="text-xs text-muted-foreground">{hero.mock.subtitle}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand to-primary text-white">
          <TrendingUpIcon className="size-4" />
        </span>
      </div>
      <ul className="mt-6 space-y-3">
        {hero.mock.stats.map((stat, index) => (
          <li key={stat.label} className="flex items-center gap-3 rounded-2xl border bg-background p-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold ${STAT_TONES[index % STAT_TONES.length]}`}>
              {stat.value}
            </span>
            <span className="flex-1 text-sm font-medium">{stat.label}</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{stat.delta}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{hero.mock.progressLabel}</span>
          <span className="font-semibold text-primary">{hero.mock.progressValue}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[72%] rounded-full bg-linear-to-r from-primary to-brand" />
        </div>
      </div>
      <span className="absolute -top-3 -right-3 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground shadow-sm">
        {hero.mock.highlightDelta}
      </span>
    </div>
  )
}

export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-0 size-[28rem] rounded-full bg-secondary/25 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
        <div>
          <Badge variant="secondary" className="h-auto rounded-full px-3 py-1">
            {hero.eyebrow}
          </Badge>
          <h1 id="hero-title" className="mt-5 text-4xl font-semibold tracking-tight text-balance md:text-5xl md:leading-[1.08] lg:text-6xl">
            {hero.titleStart}{" "}
            <span className="bg-linear-to-r from-primary to-sky-700 bg-clip-text text-transparent">{hero.titleHighlight}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">{hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-6 text-base")}>
              {hero.ctaPrimary}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <a
              href="#funcionalidades"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 rounded-xl px-6 text-base")}
            >
              {hero.ctaSecondary}
            </a>
          </div>
        </div>
        <DashboardMock />
      </div>
    </section>
  )
}
