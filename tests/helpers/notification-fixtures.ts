import { randomUUID } from "node:crypto"
import type { Database } from "@/types/database.types"
import { makeAssessmentFixture } from "./course-fixtures"
import { psql } from "./sql"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Fixtures shared by the notification suites. Time is always read from the
 * DATABASE clock (`at(hours)`), never the host clock, so window edges hold
 * even when the container clock drifts. Sweeps are called with psql.
 *
 * Task submissions are seeded as attempt rows (service role) rather than via
 * `submit_task`: the local storage schema rejects the signed-upload path
 * (42P10 on storage.objects ON CONFLICT), which is unrelated to notifications.
 */

export const ORG_A = "11111111-1111-1111-1111-111111111111"
export const ORG_B = "22222222-2222-2222-2222-222222222222"

export type NotificationType = Database["public"]["Enums"]["notification_type"]
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"]
type AttemptStatus = Database["public"]["Enums"]["attempt_status"]

/** Database "now" in epoch ms. */
export function dbNowMs(): number {
  return Math.round(Number(psql("select extract(epoch from now())")) * 1000)
}

/** ISO timestamp `hours` away from the database clock (negative = past). */
export function at(hours: number): string {
  return new Date(dbNowMs() + hours * 3_600_000).toISOString()
}

/** Notification rows of one user, optionally narrowed by type and/or entity. */
export async function notificationsOf(
  userId: string,
  filter: { type?: NotificationType; entityId?: string } = {}
): Promise<NotificationRow[]> {
  let query = supabaseAdmin.from("notifications").select("*").eq("user_id", userId)
  if (filter.type) query = query.eq("type", filter.type)
  if (filter.entityId) query = query.eq("entity_id", filter.entityId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/** A TASK in the given edition, due at `availableUntil` (ISO). Returns its assessment id. */
export async function makeTask(
  offeringId: string,
  organizationId: string,
  title: string,
  availableUntil: string,
  allowLateSubmissions = false
): Promise<string> {
  const fixture = await makeAssessmentFixture({
    offeringId,
    organizationId,
    title,
    kind: "TASK",
    availableUntil,
    allowLateSubmissions,
  })
  return fixture.assessmentId
}

/** Attempt row written by the service role. Used for the TASK submission states the suites grade or sweep. */
export async function insertAttempt(p: {
  assessmentId: string
  enrollmentId: string
  userId: string
  organizationId: string
  status: AttemptStatus
  submittedLate?: boolean
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("assessment_attempts")
    .insert({
      assessment_id: p.assessmentId,
      enrollment_id: p.enrollmentId,
      user_id: p.userId,
      organization_id: p.organizationId,
      attempt_number: 1,
      status: p.status,
      submitted_at: p.status === "IN_PROGRESS" ? null : new Date().toISOString(),
      submitted_late: p.submittedLate ?? false,
    })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("attempt not inserted")
  return data.id
}

/** Inserts a notification straight into the table (service role), for read-path suites. */
export async function seedNotification(
  userId: string,
  organizationId: string,
  type: NotificationType,
  extra: { updatedAt?: string } = {}
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      type,
      entity_id: randomUUID(),
      payload: {},
      ...(extra.updatedAt ? { updated_at: extra.updatedAt } : {}),
    })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("notification not seeded")
  return data.id
}

/** Organization with its own timezone (organization_settings row), for timezone-sensitive cases. */
export async function makeOrgInTimezone(timeZone: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .insert({ name: `Notif ${timeZone}`, slug: `notif-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("org not created")
  const { error: settingsError } = await supabaseAdmin
    .from("organization_settings")
    .upsert({ organization_id: data.id, timezone: timeZone })
  if (settingsError) throw settingsError
  return data.id
}

/** Deletes an org created by `makeOrgInTimezone` (after its users and courses are gone). */
export async function deleteOrg(orgId: string): Promise<void> {
  await supabaseAdmin.from("organizations").delete().eq("id", orgId)
}

/** Local calendar date (YYYY-MM-DD) of the database clock in an IANA timezone. */
export function localToday(timeZone: string): string {
  return psql(`select (now() at time zone '${timeZone}')::date`)
}

/** The calendar day after a YYYY-MM-DD string. */
export function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}
