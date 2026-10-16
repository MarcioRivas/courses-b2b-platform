import path from "node:path"
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

config({ path: path.resolve(process.cwd(), ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"
const GROUP_A = "11111111-1111-1111-1111-111111111112"
const GROUP_B = "22222222-2222-2222-2222-222222222223"

type SeedRole = "ADMIN" | "PROFESSOR" | "STUDENT"

interface SeedUser {
  email: string
  firstName: string
  lastName: string
  role: SeedRole
  organizationId: string
  groupId?: string
}

const SUPER_ADMIN_EMAIL = "super@kururu.test"

const SEED_USERS: SeedUser[] = [
  { email: "admin@club-a.test", firstName: "Ana", lastName: "Admin", role: "ADMIN", organizationId: ORG_A },
  { email: "prof@club-a.test", firstName: "Pablo", lastName: "Profesor", role: "PROFESSOR", organizationId: ORG_A },
  { email: "alum1@club-a.test", firstName: "Alumno", lastName: "Uno", role: "STUDENT", organizationId: ORG_A, groupId: GROUP_A },
  { email: "alum2@club-a.test", firstName: "Alumno", lastName: "Dos", role: "STUDENT", organizationId: ORG_A, groupId: GROUP_A },
  { email: "alum3@club-a.test", firstName: "Alumno", lastName: "Tres", role: "STUDENT", organizationId: ORG_A, groupId: GROUP_A },
  { email: "admin@fed-b.test", firstName: "Beatriz", lastName: "Admin", role: "ADMIN", organizationId: ORG_B },
  { email: "prof@fed-b.test", firstName: "Bruno", lastName: "Profesor", role: "PROFESSOR", organizationId: ORG_B },
  { email: "alum1@fed-b.test", firstName: "Alumna", lastName: "Uno", role: "STUDENT", organizationId: ORG_B, groupId: GROUP_B },
  { email: "alum2@fed-b.test", firstName: "Alumna", lastName: "Dos", role: "STUDENT", organizationId: ORG_B, groupId: GROUP_B },
  { email: "alum3@fed-b.test", firstName: "Alumna", lastName: "Tres", role: "STUDENT", organizationId: ORG_B, groupId: GROUP_B },
]

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return found?.id ?? null
}

async function getOrCreateUserId(email: string): Promise<string> {
  const existing = await findUserIdByEmail(email)
  if (existing) return existing

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  if (!data.user) throw new Error(`Failed to create user ${email}`)
  return data.user.id
}

async function upsertProfile(userId: string, firstName: string, lastName: string, email: string) {
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, first_name: firstName, last_name: lastName })
  if (profileError) throw profileError

  const { error: privateError } = await admin
    .from("profile_private")
    .upsert({ user_id: userId, email })
  if (privateError) throw privateError
}

async function upsertMembership(organizationId: string, userId: string, role: SeedRole) {
  const { error } = await admin.from("organization_memberships").upsert(
    { organization_id: organizationId, user_id: userId, role, status: "ACTIVE" },
    { onConflict: "organization_id,user_id" }
  )
  if (error) throw error
}

async function upsertGroupMember(groupId: string, userId: string) {
  const { error } = await admin
    .from("group_members")
    .upsert({ group_id: groupId, user_id: userId }, { onConflict: "group_id,user_id" })
  if (error) throw error
}

async function upsertPlatformAdmin(userId: string) {
  const { error } = await admin.from("platform_admins").upsert({ user_id: userId })
  if (error) throw error
}

async function seedUser(user: SeedUser): Promise<void> {
  const userId = await getOrCreateUserId(user.email)
  await upsertProfile(userId, user.firstName, user.lastName, user.email)
  await upsertMembership(user.organizationId, userId, user.role)
  if (user.groupId) {
    await upsertGroupMember(user.groupId, userId)
  }
  console.log(`seeded ${user.role} ${user.email}`)
}

async function main(): Promise<void> {
  const superId = await getOrCreateUserId(SUPER_ADMIN_EMAIL)
  await upsertProfile(superId, "Super", "Admin", SUPER_ADMIN_EMAIL)
  await upsertPlatformAdmin(superId)
  console.log(`seeded platform admin ${SUPER_ADMIN_EMAIL}`)

  for (const user of SEED_USERS) {
    await seedUser(user)
  }

  console.log("seed-users complete")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
