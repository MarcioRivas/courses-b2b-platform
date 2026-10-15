"use client"

import { cn } from "@/lib/utils"
import { NavLink } from "./nav-link"
import { useNavBadge } from "./nav-badges"
import type { NavItem, NavSection } from "./nav-config"

interface NavSectionsProps {
  sections: NavSection[]
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}

/** Untitled nav groups separated by a divider; shared by the sidebar and the mobile menu. */
export function NavSections({ sections, collapsed = false, onNavigate, className }: NavSectionsProps) {
  return (
    <nav className={cn("flex flex-col", className)}>
      {sections.map((section, index) => (
        <div
          key={section.items[0]?.href ?? index}
          className={cn("flex flex-col gap-1", index > 0 && "mt-3 border-t border-sidebar-border pt-3")}
        >
          {section.items.map((item) => (
            <NavItemLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

function NavItemLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const badgeCount = useNavBadge(item.badge)
  return (
    <NavLink
      href={item.href}
      label={item.label}
      exact={item.exact}
      icon={item.icon ? <item.icon /> : undefined}
      collapsed={collapsed}
      badgeCount={badgeCount}
      onClick={onNavigate}
    />
  )
}
