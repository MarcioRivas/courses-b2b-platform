/** Navigation per role, shared by the desktop sidebar and the mobile menu. */
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
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { learnMessages } from "@/lib/messages/learn"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { analyticsMessages } from "@/lib/messages/analytics"
import { studentTranscriptMessages } from "@/lib/messages/student-transcript"
import { auditMessages } from "@/lib/messages/audit"
import type { Database } from "@/types/database.types"

/** No org switcher (B7): a "platform admin" is not org-scoped, everyone else has one role. */
export type AppRole = "PLATFORM_ADMIN" | Database["public"]["Enums"]["membership_role"]

export interface NavItem {
  label: string
  href: string
  icon?: LucideIcon
  /** Role root: highlighted only on its exact path so children don't double-match. */
  exact?: boolean
}

/** Sections render with a divider between them and no title (user decision). */
export interface NavSection {
  items: NavItem[]
}

export const NAV_SECTIONS: Record<AppRole, NavSection[]> = {
  PLATFORM_ADMIN: [
    {
      items: [
        { label: messages.nav.platformHome, href: "/platform", icon: LayoutDashboardIcon, exact: true },
        { label: messages.nav.platformAdmin, href: "/platform/organizations", icon: Building2Icon },
        { label: auditMessages.nav.title, href: "/platform/audit", icon: ShieldCheckIcon },
      ],
    },
  ],
  ADMIN: [
    { items: [{ label: messages.nav.admin, href: "/admin", icon: LayoutDashboardIcon, exact: true }] },
    {
      items: [
        { label: messages.nav.members, href: "/admin/members", icon: UsersIcon },
        { label: messages.nav.groups, href: "/admin/groups", icon: UsersRoundIcon },
        { label: messages.nav.links, href: "/admin/links", icon: Link2Icon },
      ],
    },
    {
      items: [
        { label: courseMessages.nav.courses, href: "/admin/courses", icon: BookOpenIcon },
        { label: analyticsMessages.nav.title, href: "/admin/analytics", icon: BarChart3Icon },
        { label: auditMessages.nav.title, href: "/admin/audit", icon: ShieldCheckIcon },
        { label: messages.nav.settings, href: "/admin/settings", icon: SettingsIcon },
      ],
    },
  ],
  PROFESSOR: [
    {
      items: [
        { label: messages.nav.professor, href: "/teach", icon: GraduationCapIcon, exact: true },
        { label: courseMessages.nav.courses, href: "/teach/courses", icon: BookOpenIcon },
        { label: teachAssessmentMessages.nav.banks, href: "/teach/banks", icon: LibraryIcon },
        { label: teachAssessmentMessages.nav.grading, href: "/teach/grading", icon: ClipboardCheckIcon },
        { label: studentTranscriptMessages.nav, href: "/teach/students", icon: UsersIcon },
      ],
    },
  ],
  STUDENT: [
    {
      items: [
        { label: learnMessages.nav.myCourses, href: "/learn", icon: BookOpenIcon, exact: true },
        { label: learnMessages.nav.catalog, href: "/learn/catalog", icon: CompassIcon },
      ],
    },
  ],
}

/** Cookie holding the desktop sidebar state, read on the server so the first paint is right. */
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed"
