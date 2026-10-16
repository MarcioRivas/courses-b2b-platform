import path from "node:path"
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json, TablesInsert } from "../../src/types/database.types"

config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
}

// The showcase uses guessable demo accounts: refuse to run against anything but a local stack.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(SUPABASE_URL)) {
  throw new Error(`seed:showcase only runs against a local Supabase (got ${SUPABASE_URL})`)
}

/** Service-role client: bypasses RLS, the same documented exception the other seed scripts use. */
export const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type { Json, TablesInsert }

/** Throws the Supabase error (or a fallback) when a write returned no row. */
export function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data == null) throw result.error ?? new Error(`${what} not created`)
  return result.data
}
