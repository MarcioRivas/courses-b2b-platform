import { AwardIcon, CheckIcon, PlayCircleIcon, TrendingUpIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"
import { TILE_TONES } from "./landing-card-styles"

const { experience } = landingMessages

type PointIcon = (typeof experience.points)[number]["icon"]

const ICONS: Record<PointIcon, LucideIcon> = { video: PlayCircleIcon, progress: TrendingUpIcon, reward: AwardIcon }

/**
 * Decorative replica of the student lesson player. As the visitor scrolls,
 * each block gets its ✓, the bar fills and "Lección completada" rises in
 * (`.lesson-preview` timelines in landing-motion.css) — scroll-driven, so it
 * never loops. Unsupported browsers and reduced motion show the final state.
 */
function LessonMock() {
  const { mock } = experience
  return (
    <div aria-hidden="true" className="lesson-preview mx-auto w-full max-w-md rounded-3xl border bg-card p-6 shadow-card">
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{mock.lesson}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div data-fill className="h-full w-full rounded-full bg-linear-to-r from-primary to-brand" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{mock.progressLabel}</p>
      <ul className="mt-5 space-y-3">
        {mock.blocks.map((block, index) => (
          <li key={block} className="flex items-center gap-3 rounded-2xl border bg-background p-3">
            <span className="relative grid size-7 shrink-0 place-items-center rounded-full border">
              <span data-step={index + 1} className="absolute inset-0 grid place-items-center rounded-full bg-success text-success-foreground">
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
            </span>
            <span className="flex-1 text-sm font-medium">{block}</span>
            <span data-step={index + 1} className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {mock.done}
            </span>
          </li>
        ))}
      </ul>
      <div data-reward className="mt-5 flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
          <AwardIcon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{mock.completedTitle}</p>
          <p className="text-xs text-muted-foreground">{mock.completedHint}</p>
        </div>
      </div>
    </div>
  )
}

export function LandingLessonPreview() {
  return (
    <section id="experiencia" aria-labelledby="experience-title" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:px-8">
        <div>
          <SectionHeading id="experience-title" eyebrow={experience.eyebrow} title={experience.title} lead={experience.lead} align="left" />
          <ul className="mt-8 space-y-5">
            {experience.points.map((point, index) => {
              const Icon = ICONS[point.icon]
              return (
                <li key={point.title} className="flex gap-4">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TILE_TONES[index % TILE_TONES.length]}`} aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{point.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{point.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <LessonMock />
      </div>
    </section>
  )
}
