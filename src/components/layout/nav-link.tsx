"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface NavLinkProps {
  href: string
  label: string
  /** Pre-rendered element (not a component): a Server Component may only pass serializable props. */
  icon?: ReactNode
  /** Role root items (`/admin`, `/learn`…) only match their exact path. */
  exact?: boolean
  onClick?: () => void
}

/** Sidebar / Sheet nav item with `aria-current="page"` derived from the pathname. */
export function NavLink({ href, label, icon, exact = false, onClick }: NavLinkProps) {
  const pathname = usePathname()
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`))

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 [&>svg]:size-4">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  )
}
