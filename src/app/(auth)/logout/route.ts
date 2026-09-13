import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

/** POST only (W10): logging out mutates session state and must not be triggerable by a plain `<a href>` link/prefetch. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/login", request.url))
}
