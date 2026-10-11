import { DirectionalTransition } from "@/components/motion/directional-transition"
import { LandingFeatures } from "./landing-features"
import { LandingFinalCta } from "./landing-final-cta"
import { LandingFooter } from "./landing-footer"
import { LandingHeader } from "./landing-header"
import { LandingHero } from "./landing-hero"
import { LandingHowItWorks } from "./landing-how-it-works"
import { LandingLessonPreview } from "./landing-lesson-preview"
import { LandingRoles } from "./landing-roles"
import { LandingTrustStrip } from "./landing-trust-strip"

/**
 * Public marketing page for anonymous visitors (server-only, no client JS).
 * `data-landing` scopes smooth anchor scrolling (landing-motion.css); the
 * transition wrapper lets the CTAs slide into /login.
 */
export function LandingPage() {
  return (
    <DirectionalTransition>
      <div data-landing className="flex flex-1 flex-col">
        <LandingHeader />
        <main id="contenido">
          <LandingHero />
          <LandingFeatures />
          <LandingLessonPreview />
          <LandingHowItWorks />
          <LandingRoles />
          <LandingTrustStrip />
          <LandingFinalCta />
        </main>
        <LandingFooter />
      </div>
    </DirectionalTransition>
  )
}
