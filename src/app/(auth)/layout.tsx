import type { ReactNode } from "react"
import { BrandMark } from "@/components/layout/brand-mark"
import { AUTH_BRAND_LABEL, AuthBrandPanel } from "@/features/auth/components/auth-brand-panel"
import { APP_NAME } from "@/lib/constants"
import { authBrandMessages } from "@/lib/messages/auth-brand"
import { DirectionalTransition } from "@/components/motion/directional-transition"

export default function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear()
  return (
    <div className="grid min-h-screen lg:grid-cols-12">
      <AuthBrandPanel />
      <main className="flex flex-col items-center justify-center gap-6 bg-muted/40 p-6 sm:p-10 lg:col-span-7">
        <BrandMark size="lg" ariaLabel={AUTH_BRAND_LABEL} className="lg:hidden" />
        {/* The landing CTAs navigate with "nav-forward": the card slides in from the landing. */}
        <DirectionalTransition>
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card sm:p-8">{children}</div>
        </DirectionalTransition>
        <p className="text-xs text-muted-foreground">{authBrandMessages.copyright(year, APP_NAME)}</p>
      </main>
    </div>
  )
}
