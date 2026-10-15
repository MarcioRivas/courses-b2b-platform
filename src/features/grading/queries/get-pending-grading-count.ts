import "server-only"

import { createClient } from "@/lib/supabase/server"
import { countPendingGrading } from "../lib/count-pending-grading"

/** Pending-grading count for the professor sidebar badge (first paint). Never throws: 0 on error. */
export async function getPendingGradingCount(): Promise<number> {
  return countPendingGrading(await createClient())
}
