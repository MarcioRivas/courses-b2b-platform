import type { ActionResult } from "@/lib/errors"
import { messagingMessages } from "@/lib/messages/messaging"

/**
 * Server actions can also throw on the client (network drop, a redirect from an
 * expired session): treat that as a failed result so callers never get stuck.
 */
export async function settleAction<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action()
  } catch {
    return { ok: false, code: "INTERNAL", message: messagingMessages.errors.UNKNOWN }
  }
}
