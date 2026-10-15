"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { settleAction } from "@/features/messaging/lib/settle-action"
import { markAllNotificationsRead } from "../actions/mark-all-notifications-read"
import { markNotificationRead } from "../actions/mark-notification-read"
import { fetchNotifications, fetchUnreadNotificationCount } from "../lib/notification-reads"
import { mergeFirstPage, type NotificationList } from "../lib/merge-notification-pages"
import { subscribeToNotificationChanges } from "../lib/subscribe-to-notification-changes"
import type { AppNotification } from "../types"

/** Coalesces a burst of changes (e.g. a sweep inserting several rows) into one fetch. */
const REFRESH_DEBOUNCE_MS = 400

/**
 * The header bell, modelled on useMessengerInbox: until the panel is first
 * opened only the unread count is refreshed; once opened, page 1 is kept fresh
 * too and merged over the list, so pages loaded with "Ver más" survive. Only
 * the newest request writes state. Read marks are optimistic and reconciled by
 * the refresh that their own Realtime UPDATE triggers.
 */
export function useNotificationsInbox(userId: string, initialUnread: number) {
  const [list, setList] = useState<NotificationList | null>(null)
  const [unreadCount, setUnreadCount] = useState(initialUnread)
  const [failed, setFailed] = useState(false)
  const loaded = useRef(false)
  const requestId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const load = useCallback(async () => {
    clearTimeout(timer.current)
    const request = ++requestId.current
    const [page, count] = await Promise.all([fetchNotifications(), fetchUnreadNotificationCount()])
    if (request !== requestId.current) return
    if (!page.ok) {
      setFailed(true)
      return
    }
    loaded.current = true
    setFailed(false)
    setList((current) => mergeFirstPage(current, page.data))
    if (count.ok) setUnreadCount(count.data)
  }, [])

  const loadMore = useCallback(async () => {
    const last = list?.items.at(-1)
    if (!last) return
    const page = await fetchNotifications(last)
    if (!page.ok) return
    setList((current) => {
      const items = current?.items ?? []
      const known = new Set(items.map((item) => item.id))
      return { items: [...items, ...page.data.items.filter((item) => !known.has(item.id))], hasMore: page.data.hasMore }
    })
  }, [list])

  const refresh = useCallback(async () => {
    if (loaded.current) {
      await load()
      return
    }
    const request = ++requestId.current
    const result = await fetchUnreadNotificationCount()
    if (request === requestId.current && result.ok) setUnreadCount(result.data)
  }, [load])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS)
  }, [refresh])

  const setRead = useCallback((match: (item: AppNotification) => boolean) => {
    const now = new Date().toISOString()
    setList((current) =>
      current
        ? { ...current, items: current.items.map((item) => (!item.readAt && match(item) ? { ...item, readAt: now } : item)) }
        : current
    )
  }, [])

  const markRead = useCallback(
    (notification: AppNotification) => {
      if (notification.readAt) return
      setRead((item) => item.id === notification.id)
      setUnreadCount((count) => Math.max(0, count - 1))
      void settleAction(() => markNotificationRead({ notificationId: notification.id })).then((result) => {
        if (!result.ok) scheduleRefresh()
      })
    },
    [setRead, scheduleRefresh]
  )

  const markAllRead = useCallback(() => {
    setRead(() => true)
    setUnreadCount(0)
    void settleAction(() => markAllNotificationsRead()).then((result) => {
      if (!result.ok) scheduleRefresh()
    })
  }, [setRead, scheduleRefresh])

  useEffect(() => {
    let joinedOnce = false
    const unsubscribe = subscribeToNotificationChanges({
      userId,
      onChange: scheduleRefresh,
      // The server counted on first paint; a REjoin catches up on anything missed offline.
      onSubscribed: () => {
        if (joinedOnce) scheduleRefresh()
        joinedOnce = true
      },
    })
    return () => {
      clearTimeout(timer.current)
      unsubscribe()
    }
  }, [userId, scheduleRefresh])

  return {
    items: list?.items ?? null,
    hasMore: list?.hasMore ?? false,
    unreadCount,
    failed,
    load,
    loadMore,
    markRead,
    markAllRead,
  }
}
