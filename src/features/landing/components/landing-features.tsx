import { BarChart3Icon, BookOpenIcon, Building2Icon, RouteIcon, ShieldCheckIcon, TimerIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"

const { features } = landingMessages

type FeatureIcon = (typeof features.items)[number]["icon"]

const ICONS: Record<FeatureIcon, LucideIcon> = {
  organizations: Building2Icon,
  courses: BookOpenIcon,
  timer: TimerIcon,
  analytics: BarChart3Icon,
  security: ShieldCheckIcon,
  progress: RouteIcon,
}

/** Icon tile tones rotate so the grid reads colourful without losing AA contrast. */
const TONES = ["bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300", "bg-warning-soft text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300", "bg-success-soft text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"] as const

export function LandingFeatures() {
  return (
    <section id="funcionalidades" aria-labelledby="features-title" className="scroll-mt-20 bg-muted/40 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionHeading id="features-title" eyebrow={features.eyebrow} title={features.title} lead={features.lead} />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item, index) => {
            const Icon = ICONS[item.icon]
            return (
              <li
                key={item.title}
                className="rounded-2xl border bg-card p-6 shadow-card transition-transform motion-safe:hover:-translate-y-0.5"
              >
                <span className={`grid size-11 place-items-center rounded-xl ${TONES[index % TONES.length]}`} aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
