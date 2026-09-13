import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { releaseSchema } from "@/features/attempts/schemas/attempt-schemas"
import { parseAttemptErrorCode } from "@/features/attempts/lib/errors"

/**
 * Releases the session lock on `pagehide`. The one call that genuinely cannot
 * be a Server Action: the page is already going away.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_ANSWER" }, { status: 400 })
  }

  const parsed = releaseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ANSWER" }, { status: 400 })
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc("release_session", {
    p_attempt: attemptId,
    p_session: parsed.data.sessionId,
  })

  if (error) {
    // Low item: map through the domain-code parser instead of echoing raw Postgres text.
    const code = parseAttemptErrorCode(error.message)
    return NextResponse.json({ error: code === "UNKNOWN" ? "SAVE_FAILED" : code }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
