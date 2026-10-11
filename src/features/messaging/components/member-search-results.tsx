"use client"

import { messagingMessages as t } from "@/lib/messages/messaging"
import type { MessageableMember } from "../types"
import { MemberAvatar } from "./member-avatar"

interface MemberSearchResultsProps {
  results: MessageableMember[] | null
  disabled: boolean
  onSelect: (member: MessageableMember) => void
}

/** People matching the search box; picking one opens (or starts) the chat. */
export function MemberSearchResults({ results, disabled, onSelect }: MemberSearchResultsProps) {
  if (results === null) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">{t.search.searching}</p>
  }
  if (results.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">{t.search.noResults}</p>
  }

  return (
    <ul className="flex flex-col">
      {results.map((member) => (
        <li key={member.userId}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(member)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
          >
            <MemberAvatar name={member.name} className="size-9 text-xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{member.name}</span>
              <span className="block text-xs text-muted-foreground">{t.roles[member.role]}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
