"use server"

import { z } from "zod"
import { createSignedUrlForBlock } from "@/lib/storage/signed-url"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"

const createSignedUrlSchema = z.object({
  blockId: z.guid(),
  path: z.string().min(1),
})

/**
 * Thin wrapper over `createSignedUrlForBlock`: no role gate here on purpose —
 * `can_view_block` already covers editors (`can_edit_course`) and enrolled
 * students, so this stays reusable by the Phase 4 student player too.
 */
export async function createSignedUrl(
  input: z.infer<typeof createSignedUrlSchema>
): Promise<ActionResult<{ url: string }>> {
  const parsed = createSignedUrlSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const url = await createSignedUrlForBlock(parsed.data.blockId, parsed.data.path)

  if (!url) {
    return { ok: false, code: "FORBIDDEN", message: contentMessages.errors.signedUrlFailed }
  }

  return { ok: true, data: { url } }
}
