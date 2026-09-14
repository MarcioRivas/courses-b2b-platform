"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { heartbeatSchema } from "../schemas/attempt-schemas"
import { attemptRpcErrorResult } from "../lib/errors"
import type { HeartbeatResult } from "../types"

const inputSchema = heartbeatSchema.extend({ attemptId: z.guid() })

export type HeartbeatInput = z.infer<typeof inputSchema>

/**
 * Claims/refreshes the session lock (D3) and resyncs the client timer. A
 * `SESSION_LOCKED` RPC error is a normal outcome here, not a failure to
 * retry blindly — the caller shows the takeover dialog.
 */
export async function heartbeat(input: HeartbeatInput): Promise<ActionResult<HeartbeatResult>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("heartbeat", {
    p_attempt: parsed.data.attemptId,
    p_session: parsed.data.sessionId,
    p_force: parsed.data.force ?? false,
  })

  if (error) {
    return attemptRpcErrorResult(error)
  }

  const row = data?.[0]
  if (!row) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  return {
    ok: true,
    data: {
      activeSessionId: row.active_session_id,
      serverNow: row.server_now,
      effectiveEndAt: row.effective_end_at,
      status: row.status,
      staleSeconds: row.stale_seconds,
    },
  }
}
