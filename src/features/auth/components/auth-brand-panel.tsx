import { BarChart3, ShieldCheck, Timer } from "lucide-react"
import { BrandMark } from "@/components/layout/brand-mark"
import { APP_NAME } from "@/lib/constants"
import { authBrandMessages } from "@/lib/messages/auth-brand"

const VALUE_PROP_ICONS = [ShieldCheck, Timer, BarChart3] as const

/** Accessible name shared by the panel mark and the mobile mark in the auth layout. */
export const AUTH_BRAND_LABEL = `${APP_NAME} — ${authBrandMessages.backToLanding}`

/**
 * Gradient brand panel shown beside the auth card at `lg` and up.
 * Gradient ends on sky-700 so white text stays ≥ 4.5:1 everywhere; sky-500 (`brand`)
 * only appears in the decorative blob, never behind copy.
 */
export function AuthBrandPanel() {
  return (
    <aside
      aria-label={APP_NAME}
      className="relative hidden overflow-hidden bg-linear-to-br from-sky-800 via-primary to-sky-700 p-10 text-white lg:col-span-5 lg:flex lg:flex-col lg:justify-between xl:p-14"
    >
      <div aria-hidden="true" className="absolute -top-24 -right-24 size-72 rounded-full bg-brand/30 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -left-20 size-80 rounded-full bg-white/10 blur-3xl" />

      <BrandMark size="lg" tone="onDark" ariaLabel={AUTH_BRAND_LABEL} className="relative w-fit gap-2.5" />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          {/* Not a heading: the aside is marketing copy and precedes the page <h1> in DOM order. */}
          <p className="max-w-md font-heading text-3xl leading-tight font-semibold text-balance xl:text-4xl">
            {authBrandMessages.headline}
          </p>
          <p className="max-w-md text-base text-white/90">{authBrandMessages.subheadline}</p>
        </div>
        <ul className="flex flex-col gap-4">
          {authBrandMessages.valueProps.map((prop, index) => {
            const Icon = VALUE_PROP_ICONS[index] ?? ShieldCheck
            return (
              <li key={prop.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20"
                >
                  <Icon className="size-4.5" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">{prop.title}</p>
                  <p className="text-sm text-white/90">{prop.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <span className="relative inline-flex w-fit items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground shadow-sm">
        {authBrandMessages.tagline}
      </span>
    </aside>
  )
}
