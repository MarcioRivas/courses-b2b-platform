/**
 * Maps a notification (type + database payload) to the bell's title, body and
 * link. Pure, so it is unit-tested with fixed inputs. Unknown types or missing
 * payload fields fall back to generic copy and a safe home link, never throw.
 * Links are built only from uuids in the payload (internal paths, no redirects).
 */
import { notificationsMessages as t } from "@/lib/messages/notifications"
import type { AppNotification, NotificationView } from "../types"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  return typeof value === "string" ? value : ""
}

function id(payload: Record<string, unknown>, key: string): string | null {
  const value = text(payload, key)
  return UUID.test(value) ? value : null
}

function count(payload: Record<string, unknown>): number {
  const value = payload.count
  return typeof value === "number" && value > 0 ? value : 1
}

/** 24h es-UY format in `timeZone`; "" if the org timezone is invalid (RangeError) instead of crashing the bell. */
function safeFormat(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("es-UY", { ...options, timeZone, hour12: false }).format(date)
  } catch {
    return ""
  }
}

/** "16/10 18:00" in the org timezone; "" when the date is missing or invalid. */
export function formatNotificationDate(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ""
  return safeFormat(date, timeZone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatClock(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ""
  return safeFormat(date, timeZone, { hour: "2-digit", minute: "2-digit" })
}

function learnCourseHref(p: Record<string, unknown>, fallback: string): string {
  const enrollmentId = id(p, "enrollmentId")
  return enrollmentId ? `/learn/courses/${enrollmentId}` : fallback
}

function learnAssessmentHref(p: Record<string, unknown>, fallback: string): string {
  const assessmentId = id(p, "assessmentId")
  const enrollmentId = id(p, "enrollmentId")
  return assessmentId && enrollmentId ? `/learn/assessments/${assessmentId}/start?enrollment=${enrollmentId}` : fallback
}

function gradingHref(p: Record<string, unknown>): string {
  const params = new URLSearchParams()
  const offeringId = id(p, "offeringId")
  const assessmentId = id(p, "assessmentId")
  if (offeringId) params.set("offeringId", offeringId)
  if (assessmentId) params.set("assessmentId", assessmentId)
  const query = params.toString()
  return query ? `/teach/grading?${query}` : "/teach/grading"
}

export function presentNotification(notification: AppNotification, timeZone: string): NotificationView {
  const p = notification.payload ?? {}
  const kind = t.kind[text(p, "kind")] ?? t.kind.TASK ?? ""

  switch (notification.type) {
    case "MODULE_OPENED":
      return {
        title: t.types.MODULE_OPENED.title,
        body: t.types.MODULE_OPENED.body(text(p, "moduleTitle"), text(p, "courseTitle")),
        href: learnCourseHref(p, "/learn"),
      }
    case "MODULE_CLOSING_SOON":
      return {
        title: t.types.MODULE_CLOSING_SOON.title,
        body: t.types.MODULE_CLOSING_SOON.body(
          text(p, "moduleTitle"),
          formatNotificationDate(text(p, "availableUntil"), timeZone)
        ),
        href: learnCourseHref(p, "/learn"),
      }
    case "ASSESSMENT_GRADED": {
      const attemptId = id(p, "attemptId")
      const href =
        text(p, "kind") === "TASK" || !attemptId ? learnAssessmentHref(p, "/learn") : `/learn/attempts/${attemptId}`
      return {
        title: t.types.ASSESSMENT_GRADED.title,
        body: t.types.ASSESSMENT_GRADED.body(kind, text(p, "assessmentTitle")),
        href,
      }
    }
    case "ASSESSMENT_DUE_SOON":
      return {
        title: t.types.ASSESSMENT_DUE_SOON.title,
        body: t.types.ASSESSMENT_DUE_SOON.body(text(p, "assessmentTitle"), formatNotificationDate(text(p, "dueAt"), timeZone)),
        href: learnAssessmentHref(p, "/learn"),
      }
    case "EXAM_TODAY":
      return {
        title: t.types.EXAM_TODAY.title,
        body: t.types.EXAM_TODAY.body(text(p, "assessmentTitle"), formatClock(text(p, "startsAt"), timeZone)),
        href: learnAssessmentHref(p, "/learn"),
      }
    case "TASK_READY_TO_GRADE":
      return {
        title: t.types.TASK_READY_TO_GRADE.title,
        body: t.types.TASK_READY_TO_GRADE.body(text(p, "assessmentTitle"), count(p)),
        href: gradingHref(p),
      }
    case "LATE_SUBMISSIONS":
      return {
        title: t.types.LATE_SUBMISSIONS.title,
        body: t.types.LATE_SUBMISSIONS.body(text(p, "assessmentTitle"), count(p)),
        href: gradingHref(p),
      }
    case "ATTEMPT_NEEDS_GRADING":
      return {
        title: t.types.ATTEMPT_NEEDS_GRADING.title,
        body: t.types.ATTEMPT_NEEDS_GRADING.body(text(p, "assessmentTitle"), count(p)),
        href: gradingHref(p),
      }
    default:
      return { title: t.types.fallback.title, body: t.types.fallback.body, href: "/" }
  }
}
