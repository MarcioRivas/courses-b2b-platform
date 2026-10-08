import { cn } from "@/lib/utils"
import { NavLink } from "./nav-link"
import type { NavSection } from "./side-nav"

interface NavSectionsProps {
  sections: NavSection[]
  onNavigate?: () => void
  className?: string
}

/** Untitled nav groups separated by a divider; shared by the sidebar and the mobile sheet. */
export function NavSections({ sections, onNavigate, className }: NavSectionsProps) {
  return (
    <nav className={cn("flex flex-col", className)}>
      {sections.map((section, index) => (
        <div
          key={section.items[0]?.href ?? index}
          className={cn("flex flex-col gap-1", index > 0 && "mt-3 border-t border-sidebar-border pt-3")}
        >
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              exact={item.exact}
              icon={item.icon ? <item.icon /> : undefined}
              onClick={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}
