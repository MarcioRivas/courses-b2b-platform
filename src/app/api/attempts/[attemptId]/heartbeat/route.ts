import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { heartbeatSchema } from "@/features/attempts/schemas/attempt-schemas"
import { parseAttemptErrorCode } from "@/features/attempts/lib/errors"

/** Keepalive-capable heartbeat; see the answers route for why these exist. */
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

  const parsed = heartbeatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ANSWER" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc("heartbeat", {
    p_attempt: attemptId,
    p_session: parsed.data.sessionId,
    p_force: parsed.data.force ?? false,
  })

  if (error) {
    // Low item: map through the domain-code parser instead of echoing raw Postgres text.
    const code = parseAttemptErrorCode(error.message)
    return NextResponse.json({ error: code === "UNKNOWN" ? "SAVE_FAILED" : code }, { status: 400 })
  }

  return NextResponse.json(data?.[0] ?? null)
}
