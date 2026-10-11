"use client"

import { useId, useState, useTransition } from "react"
import { MessagesSquareIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PopoverTitle } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { startConversation } from "../actions/start-conversation"
import { settleAction } from "../lib/settle-action"
import { useMemberSearch } from "../hooks/use-member-search"
import type { ConversationSummary, MessageableMember } from "../types"
import { useMessenger } from "./messenger-provider"
import { ConversationList } from "./conversation-list"
import { MemberSearchResults } from "./member-search-results"

type InboxTab = "all" | "unread"

/** Messenger-style pill tabs instead of the default segmented control. */
const PILL_TAB =
  "h-9 flex-none rounded-full px-4 font-semibold data-active:bg-brand-soft data-active:text-sky-800 data-active:shadow-none dark:data-active:bg-sky-950/40 dark:data-active:text-sky-300"

/**
 * Header dropdown, Messenger style: title, a people search on top, then the
 * "Todos" / "No leídos" tabs over the inbox. Picking a conversation or a person
 * opens the chat window at the bottom and closes the panel.
 */
export function MessengerPanel({ onDone }: { onDone: () => void }) {
  const { conversations, failed, currentUserId, timeZone, openChat } = useMessenger()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<InboxTab>("all")
  const [starting, startTransition] = useTransition()
  const search = useMemberSearch(query)
  const searchId = useId()

  function openExisting(conversation: ConversationSummary) {
    openChat({ id: conversation.id, name: conversation.otherName })
    onDone()
  }

  function openWithMember(member: MessageableMember) {
    startTransition(async () => {
      const result = await settleAction(() => startConversation({ userId: member.userId }))
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      openChat({ id: result.data.conversationId, name: member.name })
      onDone()
    })
  }

  const shown = conversations?.filter((conversation) => tab === "all" || conversation.unreadCount > 0) ?? null

  const inbox =
    shown === null ? (
      <p className="px-2 py-3 text-sm text-muted-foreground">{failed ? t.errors.UNKNOWN : t.panel.loading}</p>
    ) : shown.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <MessagesSquareIcon aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">{tab === "unread" ? t.panel.noUnread : t.inbox.emptyTitle}</p>
        {tab === "all" && <p className="text-xs text-muted-foreground">{t.panel.emptyHint}</p>}
      </div>
    ) : (
      <ConversationList conversations={shown} currentUserId={currentUserId} timeZone={timeZone} onSelect={openExisting} />
    )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as InboxTab)}
      className="flex max-h-[min(38rem,calc(100dvh-5rem))] w-[min(22.5rem,calc(100vw-1rem))] flex-col gap-0"
    >
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2">
        <PopoverTitle className="text-2xl font-bold tracking-tight">{t.panel.title}</PopoverTitle>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {t.panel.searchLabel}
          </label>
          <SearchIcon aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            autoComplete="off"
            value={query}
            maxLength={100}
            placeholder={t.panel.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 rounded-full border-transparent bg-muted pl-9"
          />
        </div>
        {!search.active && (
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className={PILL_TAB}>
              {t.panel.all}
            </TabsTrigger>
            <TabsTrigger value="unread" className={PILL_TAB}>
              {t.panel.unread}
            </TabsTrigger>
          </TabsList>
        )}
      </div>
      <div className="min-h-40 flex-1 overflow-y-auto px-2 pb-2">
        {search.active ? (
          <MemberSearchResults results={search.results} disabled={starting} onSelect={openWithMember} />
        ) : (
          // One panel shared by both tabs: the list is filtered by the active tab.
          <TabsContent value={tab}>{inbox}</TabsContent>
        )}
      </div>
    </Tabs>
  )
}
