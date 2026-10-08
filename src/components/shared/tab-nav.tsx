import Link from "next/link"
import { cn } from "@/lib/utils"

export interface TabNavItem {
  key: string
  label: string
  href: string
}

/** Link-based tab strip for detail pages whose tabs are separate routes. */
export function TabNav({ tabs, active, label }: { tabs: TabNavItem[]; active: string; label: string }) {
  return (
    <nav className="flex gap-1 border-b" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            tab.key === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
