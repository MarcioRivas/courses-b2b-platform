import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_URL, supabaseAdmin } from "./supabase-admin"
import { psql } from "./sql"

type MembershipRole = Database["public"]["Enums"]["membership_role"]
type MembershipStatus = Database["public"]["Enums"]["membership_status"]

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient<Database>
}

export interface MakeUserOptions {
  organizationId?: string
  role?: MembershipRole
  status?: MembershipStatus
  firstName?: string
  lastName?: string
}

const TEST_EMAIL_PREFIX = "test+"

/** Unique throwaway email, always prefixed so cleanup/reset can find it. */
export function testEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${label}-${randomUUID().slice(0, 8)}@kururu.test`
}

/**
 * Creates a real auth.users row (service role), profile + profile_private,
 * optional org membership, and a user-scoped client signed in via anon key.
 */
export async function makeUser(emailLabel: string, options: MakeUserOptions = {}): Promise<TestUser> {
  const email = testEmail(emailLabel)
  const password = `Test-${randomUUID()}!aA1`

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error(`failed to create user ${email}`)
  const userId = data.user.id

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({ id: userId, first_name: options.firstName ?? "Test", last_name: options.lastName ?? "User" })
  if (profileError) throw profileError

  const { error: privateError } = await supabaseAdmin
    .from("profile_private")
    .insert({ user_id: userId, email })
  if (privateError) throw privateError

  if (options.organizationId) {
    const { error: membershipError } = await supabaseAdmin.from("organization_memberships").insert({
      organization_id: options.organizationId,
      user_id: userId,
      role: options.role ?? "STUDENT",
      status: options.status ?? "ACTIVE",
    })
    if (membershipError) throw membershipError
  }

  const client = createClient<Database>(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  return { id: userId, email, client }
}

/** Deleting the auth.users row cascades to profiles/profile_private/memberships. */
export async function deleteUser(userId: string): Promise<void> {
  await supabaseAdmin.auth.admin.deleteUser(userId)
}

/**
 * Deletes a test user identified only by email (E2E flows never see a user
 * id — the browser is the only client). `auth.users` isn't exposed over
 * PostgREST, so the id is resolved via a direct psql lookup first (W6).
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const id = psql(`select id from auth.users where email = '${email.replace(/'/g, "''")}';`)
  if (id) {
    await deleteUser(id)
  }
}

/** Anonymous (unauthenticated) client — for anon-role RLS assertions. */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
