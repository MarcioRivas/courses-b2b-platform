import { LandingFeatures } from "./landing-features"
import { LandingFooter } from "./landing-footer"
import { LandingHeader } from "./landing-header"
import { LandingHero } from "./landing-hero"
import { LandingHowItWorks } from "./landing-how-it-works"
import { LandingRoles } from "./landing-roles"
import { LandingTrustStrip } from "./landing-trust-strip"

/** Public marketing page for anonymous visitors (server-only, no client JS). */
export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingHeader />
      <main id="contenido">
        <LandingHero />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingRoles />
        <LandingTrustStrip />
      </main>
      <LandingFooter />
    </div>
  )
}
