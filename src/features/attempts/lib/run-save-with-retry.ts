import type { ActionResult } from "@/lib/errors"
import { RETRY_DELAYS_MS } from "./dirty-map"
import type { SaveAnswersResult } from "../types"

/** M6: retrying these blindly either wastes 3.5s on a doomed request or fights the lock dialog. */
export const NON_TRANSIENT_SAVE_CODES = new Set(["LOCKED", "VALIDATION", "FORBIDDEN", "NOT_FOUND"])

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Pure retry loop extracted from `useAutosave` (review N2, cycle 2): sends
 * once, then retries on the 500/1000/2000ms backoff (`RETRY_DELAYS_MS`) until
 * it succeeds or hits a non-transient error code. Has no knowledge of the
 * dirty map or React state — the caller reconciles the final result.
 */
export async function runSaveWithRetry(
  send: () => Promise<ActionResult<SaveAnswersResult>>
): Promise<ActionResult<SaveAnswersResult>> {
  let result = await send()

  for (let attempt = 0; !result.ok && !NON_TRANSIENT_SAVE_CODES.has(result.code); attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay === undefined) {
      break
    }
    await wait(delay)
    result = await send()
  }

  return result
}
