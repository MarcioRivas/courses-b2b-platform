import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saveAnswersSchema } from "@/features/attempts/schemas/attempt-schemas"
import { parseAttemptErrorCode } from "@/features/attempts/lib/errors"

/**
 * The unload-safe autosave path (D30).
 *
 * This exists for one reason: `pagehide` cannot await a Server Action, so the
 * final flush when a student closes the tab has to be a `fetch(..., {
 * keepalive: true })`. It is cookie-authenticated and calls exactly the same
 * RPC with exactly the same validation as the action — it grants no capability
 * the normal path does not already have. Phase 7's k6 load test drives these
 * handlers too.
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

  const parsed = saveAnswersSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ANSWER" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc("save_answers_batch", {
    p_attempt: attemptId,
    p_session: parsed.data.sessionId,
    p_answers: parsed.data.answers,
  })

  if (error) {
    // Low item: never echo the raw Postgres error text to the client — map
    // through the same domain-code parser the Server Action uses.
    const code = parseAttemptErrorCode(error.message)
    return NextResponse.json({ error: code === "UNKNOWN" ? "SAVE_FAILED" : code }, { status: 400 })
  }

  return NextResponse.json(data?.[0] ?? null)
}
