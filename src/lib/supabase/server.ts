import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/types/database.types"

/**
 * Server Supabase client (anon key + request cookies). Use in Server Components,
 * Server Actions and Route Handlers. Always create a fresh instance per request.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component render — cookies can't be written here.
            // Session refresh already happens in proxy.ts, so this is safe to ignore.
          }
        },
      },
    }
  )
}
