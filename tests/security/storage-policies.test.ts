import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildSecurityFixture, type SecurityFixture } from "./fixture"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { buildCourseFilePath, COURSE_FILES_BUCKET } from "@/lib/storage/file-path"

/**
 * Phase 7 step 6. `tests/integration/storage-isolation.test.ts` already
 * covers: no `authenticated` list()/download() at all (incl. an enrolled
 * student on their own course), and a professor of course X cannot
 * write/delete under course Y in the SAME org. This file covers the
 * remaining gaps the brief calls out: cross-ORG path isolation, signed URL
 * expiry, oversized/wrong-MIME rejection, and `can_view_block` denial (the
 * gate `create-signed-url` actually relies on — Server Actions need cookies,
 * so the underlying RPC is what's testable here).
 */

let fx: SecurityFixture
const uploadedPaths: string[] = []
const PDF_BYTES = Buffer.from("%PDF-1.4 security test file")

beforeAll(async () => {
  fx = await buildSecurityFixture()
}, 60000)

afterAll(async () => {
  if (uploadedPaths.length > 0) await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).remove(uploadedPaths)
  await fx.cleanup()
})

describe("cross-org path isolation (D10/D26)", () => {
  it("org B's admin cannot upload under org A's course prefix", async () => {
    const path = buildCourseFilePath({ organizationId: fx.orgA, courseId: fx.courseA.courseId, fileName: "cross-org.pdf" })
    const { error } = await fx.users.adminB.client.storage
      .from(COURSE_FILES_BUCKET)
      .upload(path, PDF_BYTES, { contentType: "application/pdf" })
    expect(error).not.toBeNull()
  })

  it("org B's professor cannot delete an object under org A's course prefix", async () => {
    const path = buildCourseFilePath({ organizationId: fx.orgA, courseId: fx.courseA.courseId, fileName: "seed.pdf" })
    uploadedPaths.push(path)
    await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).upload(path, PDF_BYTES, { contentType: "application/pdf" })

    await fx.users.profB.client.storage.from(COURSE_FILES_BUCKET).remove([path])

    const { data } = await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).list(`${fx.orgA}/${fx.courseA.courseId}`)
    expect((data ?? []).map((f) => f.name)).toContain(path.split("/").pop())
  })
})

describe("signed URL expiry", () => {
  it("a URL minted with a 1s expiry stops serving the file shortly after", async () => {
    const path = buildCourseFilePath({ organizationId: fx.orgA, courseId: fx.courseA.courseId, fileName: "expiring.pdf" })
    uploadedPaths.push(path)
    await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).upload(path, PDF_BYTES, { contentType: "application/pdf" })

    const { data: signed, error } = await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).createSignedUrl(path, 1)
    expect(error).toBeNull()
    expect(signed?.signedUrl).toBeTruthy()

    const immediate = await fetch(signed!.signedUrl)
    expect(immediate.ok).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const afterExpiry = await fetch(signed!.signedUrl)
    expect(afterExpiry.status).toBeGreaterThanOrEqual(400)
  })
})

describe("bucket config rejects oversized / wrong-MIME uploads (50MB, pdf/png/jpeg/webp only)", () => {
  it("rejects a text/plain upload regardless of who's uploading", async () => {
    const path = buildCourseFilePath({ organizationId: fx.orgA, courseId: fx.courseA.courseId, fileName: "not-allowed.txt" })
    const { error } = await fx.users.profA.client.storage
      .from(COURSE_FILES_BUCKET)
      .upload(path, Buffer.from("plain text"), { contentType: "text/plain" })
    expect(error).not.toBeNull()
  })

  it("rejects a file over the 50MB bucket limit", async () => {
    const path = buildCourseFilePath({ organizationId: fx.orgA, courseId: fx.courseA.courseId, fileName: "too-big.pdf" })
    const oversized = Buffer.alloc(52_428_800 + 1024, 0)
    const { error } = await fx.users.profA.client.storage
      .from(COURSE_FILES_BUCKET)
      .upload(path, oversized, { contentType: "application/pdf" })
    expect(error).not.toBeNull()
  }, 30000)
})

describe("can_view_block: the gate create-signed-url relies on (Server Actions need cookies, so tested at the RPC)", () => {
  it("refuses a caller from another org entirely", async () => {
    const { data, error } = await fx.users.studentB.client.rpc("can_view_block", {
      p_block: fx.courseA.modules[0]!.blockIds[0]!,
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it("allows the enrolled owner (studentA) once the module is available", async () => {
    const { data, error } = await fx.users.studentA.client.rpc("can_view_block", {
      p_block: fx.courseA.modules[0]!.blockIds[0]!,
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })
})
