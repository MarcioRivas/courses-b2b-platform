"use client"

import { useState } from "react"
import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
import { BrandMark } from "./brand-mark"
import { NavLink } from "./nav-link"
import { NAV_ITEMS, type AppRole } from "./side-nav"
import { UserMenu } from "./user-menu"

interface TopNavProps {
  role: AppRole
  organizationName: string | null
  userName: string
  userEmail: string
}

export function TopNav({ role, organizationName, userName, userEmail }: TopNavProps) {
  const [open, setOpen] = useState(false)
  const items = NAV_ITEMS[role]
  const label = organizationName ?? APP_NAME

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label={messages.nav.openMenu} />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="bg-sidebar">
            <SheetHeader>
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  exact={item.exact}
                  icon={item.icon ? <item.icon /> : undefined}
                  onClick={() => setOpen(false)}
                />
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <BrandMark size="sm" />
      </div>
      <span className="hidden text-sm font-medium md:block">{label}</span>
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  )
}
