import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { messages } from "@/lib/messages/es"

interface WelcomeHeroProps {
  firstName: string
  roleLabel: string
  roleIcon: LucideIcon
}

/** One entrance: greeting → role (40ms `stagger-item` steps). */
function step(index: number): CSSProperties {
  return { "--stagger-index": index } as CSSProperties
}

/**
 * Centered welcome for a role's home page: "Bienvenid@, Ana" and
 * the role. The organization is already in the header, so it is not repeated.
 */
export function WelcomeHero({ firstName, roleLabel, roleIcon: RoleIcon }: WelcomeHeroProps) {
  return (
    <section className="grid min-h-[calc(100dvh-12rem)] place-items-center">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1
          aria-label={messages.home.welcomeLabel(firstName)}
          className="stagger-item text-4xl font-bold tracking-tight text-balance md:text-6xl"
          style={step(0)}
        >
          {messages.home.welcome},{" "}
          <span className="bg-linear-to-r from-primary to-cyan-700 bg-clip-text text-transparent dark:from-sky-300 dark:to-cyan-300">
            {firstName}
          </span>
        </h1>
        <Badge variant="brand" className="stagger-item h-8 gap-1.5 px-4 text-sm" style={step(1)}>
          <RoleIcon aria-hidden="true" className="size-4" />
          {roleLabel}
        </Badge>
      </div>
    </section>
  )
}
