import { randomUUID } from "node:crypto"
import { expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "../helpers/supabase-admin"
import type { Database } from "@/types/database.types"
import type { Role7, SecurityFixture } from "./fixture"

export const ALL_ROLES: Role7[] = ["superAdmin", "adminA", "profA", "studentA", "adminB", "profB", "studentB"]

type TableName = keyof Database["public"]["Tables"]
type Row = Record<string, unknown>

interface BaseCase {
  table: TableName
  /** Composite-key aware: default ['id']. Use e.g. ['course_id','user_id'] for join tables without a surrogate id. */
  keyColumns?: string[]
}

export interface SelectCase extends BaseCase {
  op: "select"
  allow: Role7[]
  /** Returns the key column values identifying the row to probe. */
  target: (fx: SecurityFixture) => Row
}

export interface InsertCase extends BaseCase {
  op: "insert"
  allow: Role7[]
  payload: (fx: SecurityFixture, role: Role7) => Row | Promise<Row>
}

export interface MutateCase extends BaseCase {
  op: "update" | "delete"
  allow: Role7[]
  /** Admin-seeded row for this iteration — always fresh, never a shared fixture row. */
  seed: (fx: SecurityFixture, iteration: number) => Promise<Row>
  /** update only: column checked before/after + the value the update attempts to set. */
  mutateColumn?: string
  updatePayload?: Row
}

export type MatrixCase = SelectCase | InsertCase | MutateCase

/**
 * The matrix operates on a dynamic `TableName` union with hand-built Row
 * payloads, which the generated per-table Insert/Update types cannot express
 * generically — this thin untyped facade is the deliberate boundary where we
 * trade static table-shape checking for the ability to drive all 31 tables
 * from one engine. Individual spec files still get full Database typing via
 * `SecurityFixture`.
 */
interface Filterable extends PromiseLike<{ data: Row[] | Row | null; error: { message: string; code?: string } | null }> {
  eq: (column: string, value: unknown) => Filterable
  select: (columns: string) => Filterable
  single: () => Filterable
}
interface AnyTable {
  insert: (payload: Row) => Filterable
  update: (payload: Row) => Filterable
  delete: () => Filterable
  select: (columns: string) => Filterable
}

function table(client: SupabaseClient<Database>, name: TableName): AnyTable {
  return client.from(name) as unknown as AnyTable
}

const scratchOrgIds: string[] = []

/** A fully isolated org, for cases needing org-scoped uniqueness (score ranges, org settings). */
export async function scratchOrg(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .insert({ name: "Matrix scratch", slug: `matrix-scratch-${randomUUID()}`, status: "ACTIVE" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("scratch org failed")
  scratchOrgIds.push(data.id)
  return data.id
}

export async function cleanupScratchOrgs(): Promise<void> {
  if (scratchOrgIds.length > 0) await supabaseAdmin.from("organizations").delete().in("id", scratchOrgIds)
}

/**
 * A scratch org where fx.adminA is a genuine ACTIVE ADMIN member — for
 * singleton-per-org tables (organization_settings) whose row for fx.orgA
 * already exists in the fixture and can't be re-seeded without a PK
 * conflict. Being `is_org_admin()` isn't enough on its own: Postgres layers
 * the table's SELECT policy on top of UPDATE/DELETE visibility, and
 * organization_settings' SELECT policy is `is_org_member()`-only — so the
 * writer must be a REAL member of the org being written to, not just pass
 * the admin check via the platform-admin bypass.
 */
export async function scratchOrgForAdminA(fx: SecurityFixture): Promise<string> {
  const org = await scratchOrg()
  await supabaseAdmin
    .from("organization_memberships")
    .insert({ organization_id: org, user_id: fx.users.adminA.id, role: "ADMIN", status: "ACTIVE" })
  return org
}

function keysOf(c: BaseCase): string[] {
  return c.keyColumns ?? ["id"]
}

function byKeys(q: Filterable, keys: string[], row: Row): Filterable {
  let query = q
  for (const key of keys) query = query.eq(key, row[key])
  return query
}

async function runSelect(fx: SecurityFixture, c: SelectCase): Promise<void> {
  const keys = keysOf(c)
  const target = c.target(fx)
  for (const role of ALL_ROLES) {
    const query = byKeys(table(fx.users[role].client, c.table).select(keys.join(",")), keys, target)
    const { data, error } = await query
    const visible = !error && Array.isArray(data) && data.length > 0
    expect(visible, `${c.table} select by ${role} (expected ${c.allow.includes(role)})`).toBe(c.allow.includes(role))
  }
}

async function runInsert(fx: SecurityFixture, c: InsertCase): Promise<void> {
  const keys = keysOf(c)
  for (const role of ALL_ROLES) {
    const payload = await c.payload(fx, role)
    const { data, error } = await table(fx.users[role].client, c.table).insert(payload).select(keys.join(",")).single()
    const expected = c.allow.includes(role)
    if (expected) {
      expect(error, `${c.table} insert by ${role} expected success: ${error?.message}`).toBeNull()
      if (data && !Array.isArray(data)) await byKeys(table(supabaseAdmin, c.table).delete(), keys, data)
    } else {
      // A constraint error (e.g. 23505 unique violation) can mask an actually
      // missing/failing RLS check (Phase 5 N1 lesson) — require the specific
      // "denied by RLS/grant" SQLSTATE, not just "some error happened".
      expect(error?.code, `${c.table} insert by ${role} expected RLS denial: ${error?.message}`).toBe("42501")
    }
  }
}

async function runUpdate(fx: SecurityFixture, c: MutateCase): Promise<void> {
  const keys = keysOf(c)
  const column = c.mutateColumn!
  const seeded = await c.seed(fx, 0)
  const { data: row, error } = await table(supabaseAdmin, c.table)
    .insert(seeded)
    .select([...keys, column].join(","))
    .single()
  if (error || !row || Array.isArray(row)) throw error ?? new Error(`seed failed for ${c.table}`)
  // Roles run sequentially against the SAME seeded row (update is non-destructive),
  // so a denied role must be compared against whatever the row currently holds —
  // not the original seed — since an earlier ALLOWED role may have already changed it.
  let previous = row[column]

  for (const role of ALL_ROLES) {
    await byKeys(table(fx.users[role].client, c.table).update(c.updatePayload!), keys, row)
    const { data: after } = await byKeys(table(supabaseAdmin, c.table).select(column), keys, row)
    const current = Array.isArray(after) ? after[0]?.[column] : undefined
    const expected = c.allow.includes(role)
    if (expected) {
      expect(current, `${c.table} update by ${role} expected success`).toEqual(c.updatePayload![column])
    } else {
      expect(current, `${c.table} update by ${role} expected denial`).toEqual(previous)
    }
    previous = current
  }
  await byKeys(table(supabaseAdmin, c.table).delete(), keys, row)
}

async function runDelete(fx: SecurityFixture, c: MutateCase): Promise<void> {
  const keys = keysOf(c)
  for (const [i, role] of ALL_ROLES.entries()) {
    const seeded = await c.seed(fx, i)
    const { data: row, error } = await table(supabaseAdmin, c.table).insert(seeded).select(keys.join(",")).single()
    if (error || !row || Array.isArray(row)) throw error ?? new Error(`seed failed for ${c.table}`)

    await byKeys(table(fx.users[role].client, c.table).delete(), keys, row)
    const { data: after } = await byKeys(table(supabaseAdmin, c.table).select(keys.join(",")), keys, row)
    const stillExists = Array.isArray(after) && after.length > 0
    const expected = c.allow.includes(role)
    expect(stillExists, `${c.table} delete by ${role} (expected allowed=${expected})`).toBe(!expected)
    if (stillExists) await byKeys(table(supabaseAdmin, c.table).delete(), keys, row)
  }
}

export async function runMatrixCase(fx: SecurityFixture, c: MatrixCase): Promise<void> {
  if (c.op === "select") return runSelect(fx, c)
  if (c.op === "insert") return runInsert(fx, c)
  if (c.op === "update") return runUpdate(fx, c)
  return runDelete(fx, c)
}
