import Link from "next/link"
import { BrandMark } from "@/components/layout/brand-mark"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { landingMessages } from "@/lib/messages/landing"

const { header } = landingMessages

const NAV_ITEMS = [
  { href: "#funcionalidades", label: header.nav.features },
  { href: "#como-funciona", label: header.nav.how },
  { href: "#roles", label: header.nav.roles },
] as const

/** Sticky, translucent header. Section anchors collapse below `md`; the CTA stays. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <BrandMark />
        <nav aria-label={header.navLabel} className="hidden items-center gap-6 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link href="/login" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>
          {header.login}
        </Link>
      </div>
    </header>
  )
}
