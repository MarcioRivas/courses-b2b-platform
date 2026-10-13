/**
 * Creates (or promotes) a single platform admin on a hosted project.
 * Unlike seed-users.ts, it creates no demo data, so it is safe for production.
 *
 * Usage: pnpm admin:create <email> <firstName> <lastName> [envFile]
 * envFile defaults to .env.production.local (needs URL + service role key).
 */
import path from "node:path"
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

const [emailArg, firstNameArg, lastNameArg, envFile = ".env.production.local"] = process.argv.slice(2)

if (!emailArg || !firstNameArg || !lastNameArg) {
  console.error("Usage: pnpm admin:create <email> <firstName> <lastName> [envFile]")
  process.exit(1)
}
const email: string = emailArg
const firstName: string = firstNameArg
const lastName: string = lastNameArg

config({ path: path.resolve(process.cwd(), envFile) })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getOrCreateUserId(userEmail: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const existing = data.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase())
  if (existing) return existing.id

  const created = await admin.auth.admin.createUser({ email: userEmail, email_confirm: true })
  if (created.error) throw created.error
  return created.data.user.id
}

async function main(): Promise<void> {
  const userId = await getOrCreateUserId(email)

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, first_name: firstName, last_name: lastName })
  if (profileError) throw profileError

  const { error: privateError } = await admin
    .from("profile_private")
    .upsert({ user_id: userId, email })
  if (privateError) throw privateError

  const { error: adminError } = await admin.from("platform_admins").upsert({ user_id: userId })
  if (adminError) throw adminError

  console.log(`Platform admin ready: ${email} (${SUPABASE_URL})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
