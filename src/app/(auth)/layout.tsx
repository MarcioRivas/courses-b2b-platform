import type { ReactNode } from "react"
import { APP_NAME } from "@/lib/constants"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <h1 className="text-lg font-semibold tracking-tight">{APP_NAME}</h1>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  )
}
