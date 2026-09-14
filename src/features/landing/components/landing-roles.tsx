import { CheckCircle2Icon, GraduationCapIcon, PresentationIcon, ShieldIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"

const { roles } = landingMessages

type RoleIcon = (typeof roles.items)[number]["icon"]

const ROLE_STYLE: Record<RoleIcon, { icon: LucideIcon; border: string; tile: string }> = {
  admin: { icon: ShieldIcon, border: "border-t-primary", tile: "bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  teacher: { icon: PresentationIcon, border: "border-t-secondary", tile: "bg-warning-soft text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300" },
  student: { icon: GraduationCapIcon, border: "border-t-success", tile: "bg-success-soft text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
}

export function LandingRoles() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="scroll-mt-20 bg-muted/40 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionHeading id="roles-title" eyebrow={roles.eyebrow} title={roles.title} lead={roles.lead} />
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {roles.items.map((role) => {
            const style = ROLE_STYLE[role.icon]
            const Icon = style.icon
            return (
              <li key={role.title} className={`rounded-2xl border border-t-4 bg-card p-6 shadow-card ${style.border}`}>
                <span className={`grid size-11 place-items-center rounded-xl ${style.tile}`} aria-hidden="true">
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
