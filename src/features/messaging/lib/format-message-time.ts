/**
 * Chat timestamps in the organization's timezone (C16). Pure functions so the
 * server-rendered inbox and the client thread agree, and so they can be tested
 * with a fixed `now`.
 */
import { messagingMessages } from "@/lib/messages/messaging"

const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-10-11": the calendar day of `iso` in `timeZone` (en-CA formats as YYYY-MM-DD). */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  )
}

/** "14:30" in `timeZone`. */
export function formatMessageClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso)
  )
}

function formatShortDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  )
}

function relativeDay(iso: string, timeZone: string, now: Date): "today" | "yesterday" | "other" {
  const key = dayKey(iso, timeZone)
  if (key === dayKey(now.toISOString(), timeZone)) return "today"
  if (key === dayKey(new Date(now.getTime() - DAY_MS).toISOString(), timeZone)) return "yesterday"
  return "other"
}

/** Separator between days in a thread: "Hoy", "Ayer" or "11/10/2026". */
export function formatDayLabel(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = relativeDay(iso, timeZone, now)
  if (day === "today") return messagingMessages.thread.today
  if (day === "yesterday") return messagingMessages.thread.yesterday
  return formatShortDate(iso, timeZone)
}

/** Inbox row: the time today, "Ayer", or the date. */
export function formatInboxTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = relativeDay(iso, timeZone, now)
  if (day === "today") return formatMessageClock(iso, timeZone)
  if (day === "yesterday") return messagingMessages.thread.yesterday
  return formatShortDate(iso, timeZone)
}
