import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { psql, psqlBool } from "../helpers/sql"

/**
 * The write paths behind the admin screens that are NOT RPCs: registration
 * link activate/revoke and organization settings both go through direct table
 * updates guarded only by RLS, so each one needs its own cross-org proof.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const createdLinkIds: string[] = []

afterAll(async () => {
  if (createdLinkIds.length > 0) {
    await supabaseAdmin.from("organization_registration_links").delete().in("id", createdLinkIds)
  }
  // Restore the seeded defaults so a re-run starts from a known state.
  await supabaseAdmin
    .from("organization_settings")
    .update({ timezone: "America/Montevideo", default_passing_score: 60 })
    .in("organization_id", [ORG_A, ORG_B])
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

async function makeLink(organizationId: string, label: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organization_registration_links")
    .insert({ organization_id: organizationId, label, default_role: "STUDENT" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("link not created")
  createdLinkIds.push(data.id)
  return data.id
}

describe("registration link activate / deactivate", () => {
  it("an org admin toggles is_active on a link of their own org", async () => {
    const adminA = await member("wp-toggle-admin-a", ORG_A, "ADMIN")
    const linkId = await makeLink(ORG_A, "Toggle propio")

    const { data, error } = await adminA.client
      .from("organization_registration_links")
      .update({ is_active: false })
      .eq("id", linkId)
      .select("id, is_active")
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.is_active).toBe(false)
  })

  it("an org A admin cannot toggle a link belonging to org B", async () => {
    const adminA = await member("wp-toggle-cross-a", ORG_A, "ADMIN")
    const linkId = await makeLink(ORG_B, "Toggle ajeno")

    // RLS filters the row out entirely: the update matches nothing rather than
    // raising, which is exactly why the action treats "no row" as an error.
    const { data } = await adminA.client
      .from("organization_registration_links")
      .update({ is_active: false })
      .eq("id", linkId)
      .select("id")
      .maybeSingle()

    expect(data).toBeNull()

    const { data: untouched } = await supabaseAdmin
      .from("organization_registration_links")
      .select("is_active")
      .eq("id", linkId)
      .single()
    expect(untouched?.is_active).toBe(true)
  })

  it("a professor of the same org cannot toggle a link", async () => {
    const professorA = await member("wp-toggle-prof-a", ORG_A, "PROFESSOR")
    const linkId = await makeLink(ORG_A, "Toggle profesor")

    const { data } = await professorA.client
      .from("organization_registration_links")
      .update({ is_active: false })
      .eq("id", linkId)
      .select("id")
      .maybeSingle()

    expect(data).toBeNull()
  })
})

describe("registration link revoke", () => {
  it("an org admin revokes a link of their own org and the token stops validating", async () => {
    const adminA = await member("wp-revoke-admin-a", ORG_A, "ADMIN")
    const linkId = await makeLink(ORG_A, "Revocar propio")

    const { data: before } = await supabaseAdmin
      .from("organization_registration_links")
      .select("token")
      .eq("id", linkId)
      .single()

    const { error } = await adminA.client
      .from("organization_registration_links")
      .update({ revoked_at: new Date().toISOString(), is_active: false })
      .eq("id", linkId)
      .select("id")
      .maybeSingle()
    expect(error).toBeNull()

    // A revoked token must fail the public validation used by /register.
    const { data: publicCheck } = await adminA.client.rpc("get_registration_link_public", {
      p_token: before!.token,
    })
    expect(publicCheck?.[0]?.valid).toBe(false)
  })

  it("an org A admin cannot revoke a link belonging to org B", async () => {
    const adminA = await member("wp-revoke-cross-a", ORG_A, "ADMIN")
    const linkId = await makeLink(ORG_B, "Revocar ajeno")

    const { data } = await adminA.client
      .from("organization_registration_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", linkId)
      .select("id")
      .maybeSingle()

    expect(data).toBeNull()

    const { data: untouched } = await supabaseAdmin
      .from("organization_registration_links")
      .select("revoked_at")
      .eq("id", linkId)
      .single()
    expect(untouched?.revoked_at).toBeNull()
  })
})

describe("organization settings", () => {
  it("an org admin persists timezone and default passing score for their own org", async () => {
    const adminA = await member("wp-settings-admin-a", ORG_A, "ADMIN")

    const { error } = await adminA.client
      .from("organization_settings")
      .update({ timezone: "America/Argentina/Buenos_Aires", default_passing_score: 75 })
      .eq("organization_id", ORG_A)
    expect(error).toBeNull()

    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("timezone, default_passing_score")
      .eq("organization_id", ORG_A)
      .single()
    expect(data).toEqual({
      timezone: "America/Argentina/Buenos_Aires",
      default_passing_score: 75,
    })
  })

  it("an org A admin cannot change org B settings", async () => {
    const adminA = await member("wp-settings-cross-a", ORG_A, "ADMIN")

    await adminA.client
      .from("organization_settings")
      .update({ default_passing_score: 1 })
      .eq("organization_id", ORG_B)

    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("default_passing_score")
      .eq("organization_id", ORG_B)
      .single()
    expect(data?.default_passing_score).toBe(60)
  })

  it("a student cannot change their own org's settings", async () => {
    const studentA = await member("wp-settings-student-a", ORG_A, "STUDENT")

    await studentA.client
      .from("organization_settings")
      .update({ default_passing_score: 2 })
      .eq("organization_id", ORG_A)

    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("default_passing_score")
      .eq("organization_id", ORG_A)
      .single()
    expect(data?.default_passing_score).not.toBe(2)
  })

  it("the passing-score check constraint rejects a value outside 0-100", async () => {
    const adminA = await member("wp-settings-range-a", ORG_A, "ADMIN")

    const { error } = await adminA.client
      .from("organization_settings")
      .update({ default_passing_score: 140 })
      .eq("organization_id", ORG_A)

    expect(error?.code).toBe("23514")
  })
})

describe("Phase 3 enrollment-sync guard", () => {
  it("uses to_regprocedure, not to_regproc, to detect sync_offering_enrollments", () => {
    // to_regproc takes a BARE name and returns NULL for any parenthesised
    // signature, which would make the guard permanently true and silently skip
    // every enrollment sync once Phase 3 ships. Nothing fails loudly if this
    // regresses, so assert the operator choice directly.
    const source = psql(
      "select prosrc from pg_proc where proname = 'sync_group_offerings';"
    )
    expect(source).toContain("to_regprocedure(")
    expect(source).not.toContain("to_regproc(")
  })

  it("to_regprocedure resolves a signature that to_regproc cannot", () => {
    expect(
      psqlBool(
        "select to_regprocedure('public.log_audit(uuid,text,text,uuid,jsonb)') is not null;"
      )
    ).toBe(true)
    expect(
      psqlBool("select to_regproc('public.log_audit(uuid,text,text,uuid,jsonb)') is null;")
    ).toBe(true)
  })

  it("resolves sync_offering_enrollments now that Phase 3 has created it", async () => {
    // Phase 2 shipped this guard before the target existed. Phase 3 created
    // both the table and the function, so the guard must now resolve — if it
    // still returned NULL the sync would be skipped silently forever.
    expect(psqlBool("select to_regclass('public.course_offerings') is not null;")).toBe(true)
    expect(
      psqlBool("select to_regprocedure('public.sync_offering_enrollments(uuid)') is not null;")
    ).toBe(true)

    const adminA = await member("guard-admin-a", ORG_A, "ADMIN")
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("organization_id", ORG_A)
      .limit(1)
      .single()
    const student = await member("guard-student-a", ORG_A, "STUDENT")

    const { error } = await adminA.client.rpc("add_group_members", {
      p_group: group!.id,
      p_user_ids: [student.id],
    })
    expect(error).toBeNull()
  })
})
