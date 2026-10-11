import type { CSSProperties } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { NAV_FORWARD } from "@/components/motion/directional-transition"
import { cn } from "@/lib/utils"
import { landingMessages } from "@/lib/messages/landing"
import { LandingDashboardMock } from "./landing-dashboard-mock"

const { hero } = landingMessages

/** One orchestrated entrance: badge → headline → subtitle → CTAs (40ms steps, `stagger-item`), then the mock lands. */
function step(index: number): CSSProperties {
  return { "--stagger-index": index } as CSSProperties
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
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:px-8 md:py-28">
        <div>
          <Badge variant="secondary" className="stagger-item h-auto rounded-full px-3 py-1" style={step(0)}>
            {hero.eyebrow}
          </Badge>
          <h1
            id="hero-title"
            className="stagger-item mt-5 text-4xl font-semibold tracking-tight text-balance md:text-5xl md:leading-[1.06] lg:text-6xl"
            style={step(1)}
          >
            {hero.titleStart} <span className="underline-draw whitespace-nowrap text-primary">{hero.titleHighlight}</span>
          </h1>
          <p className="stagger-item mt-6 max-w-xl text-lg text-muted-foreground" style={step(2)}>
            {hero.subtitle}
          </p>
          <div className="stagger-item mt-8 flex flex-wrap gap-3" style={step(3)}>
            <Link
              href="/login"
              transitionTypes={NAV_FORWARD}
              className={cn(buttonVariants({ size: "lg" }), "group h-12 rounded-xl px-6 text-base")}
            >
              {hero.ctaPrimary}
              <ArrowRightIcon data-icon="inline-end" className="transition-transform duration-150 group-hover:translate-x-[3px]" />
            </Link>
            <a
              href="#funcionalidades"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 rounded-xl px-6 text-base")}
            >
              {hero.ctaSecondary}
            </a>
          </div>
        </div>
        <LandingDashboardMock />
      </div>
    </section>
  )
}
