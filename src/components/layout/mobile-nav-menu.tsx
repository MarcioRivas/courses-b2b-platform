"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MenuIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
import { NavSections } from "./nav-sections"
import { NAV_SECTIONS, type AppRole } from "./nav-config"

const MENU_ID = "mobile-nav-menu"

/**
 * Mobile menu (under `md`): a toggle in the header that drops a full-width
 * panel down from under the header to the bottom of the screen. Closes on
 * navigation, on Escape, and when the route changes.
 */
export function MobileNavMenu({ role, organizationName }: { role: AppRole; organizationName: string | null }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close when the route changes (e.g. back/forward), not only on link clicks.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={open ? messages.nav.closeMenu : messages.nav.openMenu}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <XIcon /> : <MenuIcon />}
      </Button>
      {open && (
        <div
          id={MENU_ID}
          className="absolute inset-x-0 top-[calc(100%+1px)] h-[calc(100dvh-3.5rem)] overflow-y-auto border-b bg-sidebar px-4 py-4 shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200 md:hidden"
        >
          <p className="mb-2 truncate px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {organizationName ?? APP_NAME}
          </p>
          <NavSections sections={NAV_SECTIONS[role]} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
