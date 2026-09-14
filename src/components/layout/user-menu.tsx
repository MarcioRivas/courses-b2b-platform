"use client"

import { LogOutIcon, UserIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { messages } from "@/lib/messages/es"

interface UserMenuProps {
  userName: string
  userEmail: string
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function UserMenu({ userName, userEmail }: UserMenuProps) {
  const initials = getInitials(userName)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={userName} />}>
        <Avatar size="sm" className="ring-2 ring-brand-soft">
          <AvatarFallback>{initials || <UserIcon className="size-4" />}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* base-ui's GroupLabel needs a Group ancestor — rendering it bare throws MenuGroupContext missing. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="font-medium">{userName}</p>
            <p className="text-xs font-normal text-muted-foreground">{userEmail}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* POST-only (W10): a plain link/prefetch must never trigger sign-out. */}
        <form action="/logout" method="post" className="contents">
          <DropdownMenuItem variant="destructive" render={<button type="submit" className="w-full" />}>
            <LogOutIcon />
            {messages.common.logout}
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
