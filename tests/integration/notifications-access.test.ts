import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { anonClient, makeUser, type TestUser } from "../helpers/make-user"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { ORG_A, ORG_B, notificationsOf, seedNotification } from "../helpers/notification-fixtures"

/**
 * Notifications read/write surface: RLS (own rows only), the RPCs' caller
 * scoping, the active-org filter, and the denial of every client write path.
 */

const cleanup: string[] = []
const member = createMemberFactory(cleanup)

let s1: TestUser
let s2: TestUser
let sB: TestUser
let noOrg: TestUser
let s1Rows: string[]
let s2Row: string
let bRow: string
let s1CrossOrgRow: string

beforeAll(async () => {
  ;[s1, s2, sB] = await Promise.all([
    member("ntf-s1", ORG_A, "STUDENT"),
    member("ntf-s2", ORG_A, "STUDENT"),
    member("ntf-b", ORG_B, "STUDENT"),
  ])
  noOrg = await makeUser("ntf-noorg")
  cleanup.push(noOrg.id)

  s1Rows = [
    await seedNotification(s1.id, ORG_A, "MODULE_OPENED"),
    await seedNotification(s1.id, ORG_A, "ASSESSMENT_GRADED"),
    await seedNotification(s1.id, ORG_A, "ASSESSMENT_DUE_SOON"),
  ]
  s2Row = await seedNotification(s2.id, ORG_A, "MODULE_OPENED")
  bRow = await seedNotification(sB.id, ORG_B, "MODULE_OPENED")
  // Same user, other org (only possible after joining a second org): hidden from the RPCs of ORG_A.
  s1CrossOrgRow = await seedNotification(s1.id, ORG_B, "EXAM_TODAY")
})

afterAll(async () => {
  for (const id of cleanup) await supabaseAdmin.auth.admin.deleteUser(id)
})

async function unreadOf(user: TestUser): Promise<number> {
  const { data, error } = await user.client.rpc("my_unread_notification_count")
  if (error) throw error
  return data ?? -1
}

describe("own rows only (RLS)", () => {
  it("a student selects only rows whose user_id is their own", async () => {
    const { data, error } = await s1.client.from("notifications").select("id, user_id")
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((row) => row.user_id === s1.id)).toBe(true)
    expect(data!.map((row) => row.id)).toEqual(expect.arrayContaining(s1Rows))
    expect(data!.map((row) => row.id)).not.toContain(s2Row)
    expect(data!.map((row) => row.id)).not.toContain(bRow)
  })

  it("another student cannot see or mark read a row by id", async () => {
    const seen = await s2.client.from("notifications").select("id").eq("id", s1Rows[0]!)
    expect(seen.data ?? []).toHaveLength(0)

    const { error } = await s2.client.rpc("mark_notification_read", { p_notification: s1Rows[0]! })
    expect(error).toBeNull()
    const target = (await notificationsOf(s1.id)).find((r) => r.id === s1Rows[0])
    expect(target?.read_at).toBeNull()
  })

  it("a cross-org student's count and list exclude another org's rows", async () => {
    expect(await unreadOf(sB)).toBe(1)
    const { data } = await sB.client.rpc("my_notifications", { p_limit: 50 })
    expect(data!.map((row) => row.id)).toEqual([bRow])

    const { data: s1List } = await s1.client.rpc("my_notifications", { p_limit: 50 })
    expect(s1List!.map((row) => row.id)).not.toContain(s1CrossOrgRow)
    expect(await unreadOf(s1)).toBe(3)
  })

  it("a user with no active organization gets a zero count and FORBIDDEN from the list", async () => {
    expect(await unreadOf(noOrg)).toBe(0)
    const { error } = await noOrg.client.rpc("my_notifications")
    expect(error?.message).toContain("FORBIDDEN")
  })
})

describe("client writes are denied", () => {
  it("cannot insert, update or delete notifications directly", async () => {
    const insert = await s1.client
      .from("notifications")
      .insert({ user_id: s1.id, organization_id: ORG_A, type: "MODULE_OPENED", entity_id: crypto.randomUUID() })
    expect(insert.error).not.toBeNull()

    const update = await s1.client.from("notifications").update({ read_at: null }).eq("id", s1Rows[0]!)
    expect(update.error).not.toBeNull()

    const remove = await s1.client.from("notifications").delete().eq("id", s1Rows[1]!)
    expect(remove.error).not.toBeNull()

    const rows = await notificationsOf(s1.id)
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(s1Rows))
  })

  it("cannot execute upsert_notification or either sweep", async () => {
    const upsert = await s1.client.rpc("upsert_notification", {
      p_user: s1.id,
      p_org: ORG_A,
      p_type: "MODULE_OPENED",
      p_entity: crypto.randomUUID(),
      p_offering: crypto.randomUUID(),
      p_payload: {},
      p_bump: true,
    })
    expect(upsert.error?.code).toBe("42501")

    const sweep = await s1.client.rpc("sweep_time_based_notifications")
    expect(sweep.error?.code).toBe("42501")

    const exam = await s1.client.rpc("sweep_exam_today_notifications")
    expect(exam.error?.code).toBe("42501")
  })

  it("anonymous callers can neither read nor call any notification RPC", async () => {
    const anon = anonClient()
    const select = await anon.from("notifications").select("id")
    expect(select.error).not.toBeNull()

    const count = await anon.rpc("my_unread_notification_count")
    expect(count.error).not.toBeNull()
    const list = await anon.rpc("my_notifications")
    expect(list.error).not.toBeNull()
    const markAll = await anon.rpc("mark_all_notifications_read")
    expect(markAll.error).not.toBeNull()
  })
})

describe("mark read", () => {
  it("marks one of my rows read and decrements the unread count by one", async () => {
    const before = await unreadOf(s1)
    const { error } = await s1.client.rpc("mark_notification_read", { p_notification: s1Rows[0]! })
    expect(error).toBeNull()
    expect(await unreadOf(s1)).toBe(before - 1)

    const row = (await notificationsOf(s1.id)).find((r) => r.id === s1Rows[0])
    expect(row?.read_at).not.toBeNull()
  })

  it("marking an already-read row again changes nothing", async () => {
    const before = (await notificationsOf(s1.id)).find((r) => r.id === s1Rows[0])
    await s1.client.rpc("mark_notification_read", { p_notification: s1Rows[0]! })
    const after = (await notificationsOf(s1.id)).find((r) => r.id === s1Rows[0])
    expect(after?.read_at).toBe(before?.read_at)
  })

  it("mark all clears only the caller's unread rows in their active org", async () => {
    const { error } = await s1.client.rpc("mark_all_notifications_read")
    expect(error).toBeNull()
    expect(await unreadOf(s1)).toBe(0)
    const rows = await notificationsOf(s1.id)
    expect(rows.filter((r) => r.id !== s1CrossOrgRow).every((r) => r.read_at !== null)).toBe(true)
    // A row in another org the user never saw in this shell stays unread.
    expect(rows.find((r) => r.id === s1CrossOrgRow)?.read_at).toBeNull()

    expect(await unreadOf(s2)).toBe(1)
    expect(await unreadOf(sB)).toBe(1)
  })
})

describe("my_notifications pagination", () => {
  // 55 rows with distinct updated_at, newest first, for one student in ORG_A.
  const BASE = Date.parse("2026-10-15T12:00:00Z")
  let pager: TestUser
  let pagerIds: string[] = []

  beforeAll(async () => {
    pager = await member("ntf-pager", ORG_A, "STUDENT")
    const rows = Array.from({ length: 55 }, (_, i) => ({
      user_id: pager.id,
      organization_id: ORG_A,
      type: "MODULE_OPENED" as const,
      entity_id: crypto.randomUUID(),
      payload: {},
      updated_at: new Date(BASE - i * 60_000).toISOString(),
    }))
    const { data, error } = await supabaseAdmin.from("notifications").insert(rows).select("id, updated_at")
    if (error) throw error
    pagerIds = (data ?? []).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((r) => r.id)
  })

  it("caps the page at 50 and floors a zero limit at 1", async () => {
    const big = await pager.client.rpc("my_notifications", { p_limit: 100 })
    expect(big.data).toHaveLength(50)
    const tiny = await pager.client.rpc("my_notifications", { p_limit: 0 })
    expect(tiny.data).toHaveLength(1)
  })

  it("walks all 55 rows in order with the (updated_at, id) cursor, no duplicates", async () => {
    const seen: string[] = []
    let cursor: { at: string; id: string } | undefined
    for (let page = 0; page < 5; page++) {
      const args = cursor ? { p_limit: 20, p_before: cursor.at, p_before_id: cursor.id } : { p_limit: 20 }
      const { data, error } = await pager.client.rpc("my_notifications", args)
      expect(error).toBeNull()
      if (!data || data.length === 0) break
      seen.push(...data.map((r) => r.id))
      const last = data[data.length - 1]!
      cursor = { at: last.updated_at, id: last.id }
    }
    expect(seen).toEqual(pagerIds)
    expect(new Set(seen).size).toBe(55)
  })

  // Sweeps insert many rows in one statement, so they share updated_at (now()):
  // the (updated_at, id) cursor must not skip rows tied on the page boundary.
  it("keeps every row when many share one updated_at across a page boundary", async () => {
    const tied = await member("ntf-ties", ORG_A, "STUDENT")
    const same = new Date(BASE - 3_600_000).toISOString()
    const { error } = await supabaseAdmin.from("notifications").insert(
      Array.from({ length: 25 }, () => ({
        user_id: tied.id,
        organization_id: ORG_A,
        type: "MODULE_OPENED" as const,
        entity_id: crypto.randomUUID(),
        payload: {},
        updated_at: same,
      }))
    )
    if (error) throw error

    const first = await tied.client.rpc("my_notifications", { p_limit: 20 })
    const last = first.data![first.data!.length - 1]!
    const second = await tied.client.rpc("my_notifications", {
      p_limit: 20,
      p_before: last.updated_at,
      p_before_id: last.id,
    })
    const seen = [...first.data!, ...second.data!].map((r) => r.id)
    expect(new Set(seen).size).toBe(25)
  })
})
