import { MinusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { MemberAvatar } from "./member-avatar"

interface ChatWindowHeaderProps {
  name: string
  /** Role of the other member; null while loading. */
  subtitle: string | null
  onMinimize: () => void
  onClose: () => void
}

/** Window title bar: who you are talking to, minimize (to a bubble) and close. */
export function ChatWindowHeader({ name, subtitle, onMinimize, onClose }: ChatWindowHeaderProps) {
  return (
    <header className="flex items-center gap-2.5 border-b py-2 pr-1.5 pl-3">
      <MemberAvatar name={name} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{name}</h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {/* Minimizing to a bubble only exists on desktop; on mobile the window is the whole screen. */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label={t.dock.minimize(name)}
        onClick={onMinimize}
      >
        <MinusIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t.dock.close(name)} onClick={onClose}>
        <XIcon />
      </Button>
    </header>
  )
}
