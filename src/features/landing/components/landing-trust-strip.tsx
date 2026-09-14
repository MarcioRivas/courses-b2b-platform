import { AccessibilityIcon, DatabaseZapIcon, KeyRoundIcon, ScrollTextIcon, type LucideIcon } from "lucide-react"
import { landingMessages } from "@/lib/messages/landing"

const { trust } = landingMessages

type TrustIcon = (typeof trust.items)[number]["icon"]

const ICONS: Record<TrustIcon, LucideIcon> = {
  rls: DatabaseZapIcon,
  otp: KeyRoundIcon,
  audit: ScrollTextIcon,
  a11y: AccessibilityIcon,
}

/** White text on primary→sky-700 stays ≥ 4.5:1 across the whole gradient. */
export function LandingTrustStrip() {
  return (
    <section aria-labelledby="trust-title" className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="rounded-3xl bg-linear-to-r from-primary to-sky-700 p-8 text-white shadow-card md:p-12">
          <h2 id="trust-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
            {trust.title}
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trust.items.map((item) => {
              const Icon = ICONS[item.icon]
              return (
                <li key={item.title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-white">{item.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
