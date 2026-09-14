import Link from "next/link"
import { BrandMark } from "@/components/layout/brand-mark"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"
import { landingMessages } from "@/lib/messages/landing"

const { footer } = landingMessages

export function LandingFooter() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 md:flex-row md:items-start md:justify-between md:px-8">
        <div className="max-w-sm">
          <BrandMark />
          <p className="mt-3 text-sm text-muted-foreground">{APP_DESCRIPTION}</p>
        </div>
        <nav aria-label={footer.navLabel}>
          <Link
            href="/login"
            className="rounded-md text-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {footer.login}
          </Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-muted-foreground md:px-8">
        © {new Date().getFullYear()} {APP_NAME}. {footer.rights}
      </p>
    </footer>
  )
}
