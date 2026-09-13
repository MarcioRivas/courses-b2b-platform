import Link from "next/link"
import { cn } from "@/lib/utils"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { learnMessages } from "@/lib/messages/learn"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { analyticsMessages } from "@/lib/messages/analytics"
import type { Database } from "@/types/database.types"

/** No org switcher (B7): a "platform admin" is not org-scoped, everyone else has one role. */
export type AppRole = "PLATFORM_ADMIN" | Database["public"]["Enums"]["membership_role"]

interface NavItem {
  label: string
  href: string
}

export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  PLATFORM_ADMIN: [
    { label: messages.nav.platformHome, href: "/platform" },
    { label: messages.nav.platformAdmin, href: "/platform/organizations" },
  ],
  ADMIN: [
    { label: messages.nav.admin, href: "/admin" },
    { label: messages.nav.members, href: "/admin/members" },
    { label: messages.nav.groups, href: "/admin/groups" },
    { label: courseMessages.nav.courses, href: "/admin/courses" },
    { label: analyticsMessages.nav.title, href: "/admin/analytics" },
    { label: messages.nav.links, href: "/admin/links" },
    { label: messages.nav.settings, href: "/admin/settings" },
  ],
  PROFESSOR: [
    { label: messages.nav.professor, href: "/teach" },
    { label: courseMessages.nav.courses, href: "/teach/courses" },
    { label: teachAssessmentMessages.nav.banks, href: "/teach/banks" },
    { label: teachAssessmentMessages.nav.grading, href: "/teach/grading" },
  ],
  STUDENT: [
    { label: learnMessages.nav.myCourses, href: "/learn" },
    { label: learnMessages.nav.catalog, href: "/learn/catalog" },
  ],
}

interface SideNavProps {
  role: AppRole
  organizationName: string | null
  className?: string
}

export function SideNav({ role, organizationName, className }: SideNavProps) {
  return (
    <aside className={cn("hidden w-56 shrink-0 flex-col border-r bg-card p-4 md:flex", className)}>
      <p className="mb-4 truncate text-sm font-medium text-muted-foreground">
        {organizationName ?? APP_NAME}
      </p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS[role].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
