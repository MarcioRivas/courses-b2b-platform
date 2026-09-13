"use client"

import { useState } from "react"
import Link from "next/link"
import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
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
    <header className="flex h-12 items-center justify-between border-b bg-background px-4 md:h-14">
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label={messages.nav.openMenu} />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="hidden text-sm font-medium md:block">{label}</span>
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  )
}
