import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { NAV_FORWARD } from "@/components/motion/directional-transition"
import { cn } from "@/lib/utils"
import { landingMessages } from "@/lib/messages/landing"

const { finalCta } = landingMessages

/** Closing call to action, the last stop before the footer. */
export function LandingFinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="pb-20 md:pb-28">
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center md:px-8">
        <h2 id="final-cta-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          {finalCta.title}
        </h2>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">{finalCta.description}</p>
        <Link
          href="/login"
          transitionTypes={NAV_FORWARD}
          className={cn(buttonVariants({ size: "lg" }), "group mt-8 h-12 rounded-xl px-6 text-base")}
        >
          {finalCta.action}
          <ArrowRightIcon data-icon="inline-end" className="transition-transform duration-150 group-hover:translate-x-[3px]" />
        </Link>
      </div>
    </section>
  )
}
