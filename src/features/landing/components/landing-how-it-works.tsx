import { landingMessages } from "@/lib/messages/landing"
import { SectionHeading } from "./section-heading"

const { how } = landingMessages

export function LandingHowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="how-title" className="scroll-mt-20 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionHeading id="how-title" eyebrow={how.eyebrow} title={how.title} lead={how.lead} />
        {/* Connector runs behind the number bubbles on wide screens only; kept outside <ol> so its only children are <li>. */}
        <div className="relative mt-12">
          <div aria-hidden="true" className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-border lg:block">
            {/* Primary line draws over the grey one as the steps scroll in. */}
            <div className="connector-draw h-full w-full bg-primary" />
          </div>
          <ol className="reveal-on-scroll relative grid gap-10 lg:grid-cols-3 lg:gap-8">
            {how.steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 lg:flex-col lg:items-center lg:text-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-4 ring-background">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
