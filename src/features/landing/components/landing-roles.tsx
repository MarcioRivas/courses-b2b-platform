import { CheckCircle2Icon, GraduationCapIcon, PresentationIcon, ShieldIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"
import { CARD_ICON_TILE, INTERACTIVE_CARD, TILE_TONES } from "./landing-card-styles"

const { roles } = landingMessages

type RoleIcon = (typeof roles.items)[number]["icon"]

/** The tinted icon tile is each role's only colour cue (no coloured top stripe). */
const ROLE_STYLE: Record<RoleIcon, { icon: LucideIcon; tile: string }> = {
  admin: { icon: ShieldIcon, tile: TILE_TONES[0] },
  teacher: { icon: PresentationIcon, tile: TILE_TONES[1] },
  student: { icon: GraduationCapIcon, tile: TILE_TONES[2] },
}

export function LandingRoles() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="scroll-mt-20 bg-muted/40 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionHeading id="roles-title" eyebrow={roles.eyebrow} title={roles.title} lead={roles.lead} />
        <ul className="reveal-on-scroll mt-12 grid gap-6 md:grid-cols-3">
          {roles.items.map((role) => {
            const style = ROLE_STYLE[role.icon]
            const Icon = style.icon
            return (
              <li key={role.title} className={INTERACTIVE_CARD}>
                <span className={`${CARD_ICON_TILE} ${style.tile}`} aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-xl font-semibold">{role.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {role.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
