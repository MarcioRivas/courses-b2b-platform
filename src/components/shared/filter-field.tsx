import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"

/** Visible label above a filter control (members, courses). */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
