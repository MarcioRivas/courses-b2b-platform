"use client"

import { useState } from "react"
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BrandMark } from "./brand-mark"
import { NavSections } from "./nav-sections"
import { NAV_SECTIONS, SIDEBAR_COLLAPSED_COOKIE, type AppRole } from "./nav-config"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

interface SideNavProps {
  role: AppRole
  organizationName: string | null
  /** Initial state from the cookie (read by the server shell). */
  defaultCollapsed: boolean
}

/** Desktop sidebar (`md` and up): expanded with names, or collapsed to icons with names on hover. */
export function SideNav({ role, organizationName, defaultCollapsed }: SideNavProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const toggleLabel = collapsed ? messages.nav.expandSidebar : messages.nav.collapseSidebar

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col gap-6 overflow-x-hidden overflow-y-auto border-r bg-sidebar py-4 transition-[width] duration-200 md:flex",
        collapsed ? "w-16 px-2" : "w-64 px-4"
      )}
    >
      {/* Toggle at the top: the bottom-left corner is taken by the Next.js dev indicator. */}
      <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
        <BrandMark iconOnly={collapsed} className={collapsed ? undefined : "px-1"} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className="text-muted-foreground"
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
      </div>
      <TooltipProvider>
        <div className="flex flex-col gap-2">
          {!collapsed && (
            <p className="truncate px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {organizationName ?? APP_NAME}
            </p>
          )}
          <NavSections sections={NAV_SECTIONS[role]} collapsed={collapsed} />
        </div>
      </TooltipProvider>
    </aside>
  )
}
