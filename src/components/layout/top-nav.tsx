import { APP_NAME } from "@/lib/constants"
import { BrandMark } from "./brand-mark"
import { MobileNavMenu } from "./mobile-nav-menu"
import type { AppRole } from "./nav-config"
import { UserMenu } from "./user-menu"
import { MessengerButton } from "@/features/messaging/components/messenger-button"
import { NotificationsButton } from "@/features/notifications/components/notifications-button"

interface TopNavProps {
  role: AppRole
  organizationName: string | null
  userName: string
  userEmail: string
  /** Chats icon next to the avatar (org roles; needs the MessengerProvider above). */
  showMessenger?: boolean
  /** Bell left of the chats icon (students and professors). */
  notifications?: { currentUserId: string; initialUnread: number; timeZone: string }
}

export function TopNav({
  role,
  organizationName,
  userName,
  userEmail,
  showMessenger = false,
  notifications,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-2 md:hidden">
        <MobileNavMenu role={role} organizationName={organizationName} />
        <BrandMark size="sm" />
      </div>
      <span className="hidden text-sm font-medium md:block">{organizationName ?? APP_NAME}</span>
      <div className="flex items-center gap-2">
        {notifications && <NotificationsButton {...notifications} />}
        {showMessenger && <MessengerButton />}
        <UserMenu userName={userName} userEmail={userEmail} />
      </div>
    </header>
  )
}
