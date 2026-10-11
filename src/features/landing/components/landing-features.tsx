import { BarChart3Icon, BookOpenIcon, Building2Icon, RouteIcon, ShieldCheckIcon, TimerIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"
import { CARD_ICON_TILE, INTERACTIVE_CARD, TILE_TONES } from "./landing-card-styles"

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

export function LandingFeatures() {
  return (
    <section id="funcionalidades" aria-labelledby="features-title" className="scroll-mt-20 bg-muted/40 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionHeading id="features-title" eyebrow={features.eyebrow} title={features.title} lead={features.lead} />
        <ul className="reveal-on-scroll mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item, index) => {
            const Icon = ICONS[item.icon]
            return (
              <li key={item.title} className={INTERACTIVE_CARD}>
                <span className={`${CARD_ICON_TILE} ${TILE_TONES[index % TILE_TONES.length]}`} aria-hidden="true">
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
