"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UnreadCountBadge } from "@/features/messaging/components/unread-count-badge"

interface NavLinkProps {
  href: string
  label: string
  icon?: ReactNode
  /** Role root items (`/admin`, `/learn`…) only match their exact path. */
  exact?: boolean
  /** Collapsed sidebar: icon only, the name shows in a tooltip on hover/focus. */
  collapsed?: boolean
  /** Red counter (e.g. pending grading); hidden at 0. Announced through the accessible name. */
  badgeCount?: number
  onClick?: () => void
}

/** Sidebar / mobile menu item with `aria-current="page"` derived from the pathname. */
export function NavLink({ href, label, icon, exact = false, collapsed = false, badgeCount = 0, onClick }: NavLinkProps) {
  const pathname = usePathname()
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`))
  const accessibleLabel = badgeCount > 0 ? `${label} (${badgeCount})` : label

  const link = (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed || badgeCount > 0 ? accessibleLabel : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {icon && (
        <span aria-hidden="true" className="relative shrink-0 [&>svg]:size-4">
          {icon}
          {collapsed && <UnreadCountBadge count={badgeCount} className="absolute -top-2.5 -right-3 h-4 min-w-4 text-[10px]" />}
        </span>
      )}
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && <UnreadCountBadge count={badgeCount} className="ml-auto ring-0" />}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
