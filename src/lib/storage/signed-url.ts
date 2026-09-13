import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { COURSE_FILES_BUCKET, isPathInsideCourse } from "./file-path"

/** Signed URLs are short-lived; they are minted per request and never stored. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Mints a signed URL for a stored course file.
 *
 * Students have no SELECT policy on `storage.objects` at all (D26), because a
 * row policy cannot express "only the file belonging to a block I may see".
 * The authorisation therefore happens here: `can_view_block` runs as the
 * CALLER (their own session), and only once it passes do we switch to the
 * service-role client to sign the object. Never sign first and check after.
 */
export async function createSignedUrlForBlock(
  blockId: string,
  path: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data: allowed, error } = await supabase.rpc("can_view_block", { p_block: blockId })

  if (error || allowed !== true) {
    return null
  }

  // Re-read the block with the caller's session so the path cannot be spoofed:
  // a caller could otherwise pass a block they may see with another block's
  // (or another tenant's) path.
  const { data: block } = await supabase
    .from("lesson_content_blocks")
    .select("data")
    .eq("id", blockId)
    .maybeSingle()

  const storedPath = readStoredPath(block?.data)
  if (!storedPath || storedPath !== path) {
    return null
  }

  // The stored value must also belong to this block's own course. Otherwise an
  // editor could paste another course's (or another tenant's) path into a block
  // they control and have the service-role client sign it for them.
  const { data: owner } = await supabase.rpc("course_id_of_block", { p_block: blockId })
  if (!owner) {
    return null
  }

  const { data: course } = await supabase
    .from("courses")
    .select("organization_id")
    .eq("id", owner)
    .maybeSingle()

  if (!course || !isPathInsideCourse(storedPath, course.organization_id, owner)) {
    return null
  }

  const admin = createAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from(COURSE_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) {
    return null
  }

  return signed.signedUrl
}

/** PDF and IMAGE blocks both keep their object path under `data.path`. */
function readStoredPath(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("path" in data)) {
    return null
  }

  const path = (data as { path?: unknown }).path
  return typeof path === "string" && path.length > 0 ? path : null
}
