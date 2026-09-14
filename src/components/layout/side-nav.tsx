import {
  BarChart3Icon,
  BookOpenIcon,
  Building2Icon,
  ClipboardCheckIcon,
  CompassIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  Link2Icon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { APP_NAME } from "@/lib/constants"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { learnMessages } from "@/lib/messages/learn"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { analyticsMessages } from "@/lib/messages/analytics"
import { auditMessages } from "@/lib/messages/audit"
import type { Database } from "@/types/database.types"
import { BrandMark } from "./brand-mark"
import { NavLink } from "./nav-link"

/** No org switcher (B7): a "platform admin" is not org-scoped, everyone else has one role. */
export type AppRole = "PLATFORM_ADMIN" | Database["public"]["Enums"]["membership_role"]

export interface NavItem {
  label: string
  href: string
  icon?: LucideIcon
  /** Role root: highlighted only on its exact path so children don't double-match. */
  exact?: boolean
}

export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  PLATFORM_ADMIN: [
    { label: messages.nav.platformHome, href: "/platform", icon: LayoutDashboardIcon, exact: true },
    { label: messages.nav.platformAdmin, href: "/platform/organizations", icon: Building2Icon },
    { label: auditMessages.nav.title, href: "/platform/audit", icon: ShieldCheckIcon },
  ],
  ADMIN: [
    { label: messages.nav.admin, href: "/admin", icon: LayoutDashboardIcon, exact: true },
    { label: messages.nav.members, href: "/admin/members", icon: UsersIcon },
    { label: messages.nav.groups, href: "/admin/groups", icon: UsersRoundIcon },
    { label: courseMessages.nav.courses, href: "/admin/courses", icon: BookOpenIcon },
    { label: analyticsMessages.nav.title, href: "/admin/analytics", icon: BarChart3Icon },
    { label: auditMessages.nav.title, href: "/admin/audit", icon: ShieldCheckIcon },
    { label: messages.nav.links, href: "/admin/links", icon: Link2Icon },
    { label: messages.nav.settings, href: "/admin/settings", icon: SettingsIcon },
  ],
  PROFESSOR: [
    { label: messages.nav.professor, href: "/teach", icon: GraduationCapIcon, exact: true },
    { label: courseMessages.nav.courses, href: "/teach/courses", icon: BookOpenIcon },
    { label: teachAssessmentMessages.nav.banks, href: "/teach/banks", icon: LibraryIcon },
    { label: teachAssessmentMessages.nav.grading, href: "/teach/grading", icon: ClipboardCheckIcon },
  ],
  STUDENT: [
    { label: learnMessages.nav.myCourses, href: "/learn", icon: BookOpenIcon, exact: true },
    { label: learnMessages.nav.catalog, href: "/learn/catalog", icon: CompassIcon },
  ],
}

interface SideNavProps {
  role: AppRole
  organizationName: string | null
  className?: string
}

export function SideNav({ role, organizationName, className }: SideNavProps) {
  return (
    <aside
      className={cn("hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex", className)}
    >
      <BrandMark className="px-1" />
      <div className="flex flex-col gap-2">
        <p className="truncate px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {organizationName ?? APP_NAME}
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS[role].map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              exact={item.exact}
              icon={item.icon ? <item.icon /> : undefined}
            />
          ))}
        </nav>
      </div>
    </aside>
  )
}
