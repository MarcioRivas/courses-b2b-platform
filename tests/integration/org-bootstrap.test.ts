import { afterAll, describe, expect, it } from "vitest"
import { deleteUser, makeUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const cleanupOrgIds: string[] = []

afterAll(async () => {
  await Promise.all(cleanup.map((id) => deleteUser(id)))
  if (cleanupOrgIds.length > 0) {
    await supabaseAdmin.from("organizations").delete().in("id", cleanupOrgIds)
  }
})

const member = createMemberFactory(cleanup)

describe("create_organization (D23 tenant bootstrap)", () => {
  it("platform admin creates an org with settings, 4 default score ranges and an ADMIN link; the link registers the first admin", async () => {
    const platformAdmin = await member("bootstrap-platform-admin", ORG_A, "STUDENT")
    await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

    const slug = `bootstrap-org-${Date.now()}`
    const { data, error } = await platformAdmin.client.rpc("create_organization", {
      p_name: "Bootstrap Org",
      p_slug: slug,
    })
    expect(error).toBeNull()
    const row = data?.[0]
    expect(row).toBeDefined()
    if (!row) throw new Error("no row returned")
    cleanupOrgIds.push(row.organization_id)

    const { data: settings } = await supabaseAdmin
      .from("organization_settings")
      .select("organization_id")
      .eq("organization_id", row.organization_id)
      .maybeSingle()
    expect(settings).not.toBeNull()

    // Assert the actual default scale (spec §33), not just that four rows
    // exist: a wrong or overlapping default would still count as four.
    const { data: ranges } = await supabaseAdmin
      .from("score_scale_ranges")
      .select("min_score, max_score, label, is_passing")
      .eq("organization_id", row.organization_id)
      .order("min_score", { ascending: true })
    expect(ranges).toEqual([
      { min_score: 0, max_score: 69, label: "No aprobado", is_passing: false },
      { min_score: 70, max_score: 79, label: "Bueno", is_passing: true },
      { min_score: 80, max_score: 89, label: "Muy bueno", is_passing: true },
      { min_score: 90, max_score: 100, label: "Excelente", is_passing: true },
    ])

    const { data: settingsDefaults } = await supabaseAdmin
      .from("organization_settings")
      .select("timezone, default_passing_score")
      .eq("organization_id", row.organization_id)
      .single()
    expect(settingsDefaults).toEqual({ timezone: "America/Montevideo", default_passing_score: 60 })

    const { data: link } = await supabaseAdmin
      .from("organization_registration_links")
      .select("token, default_role")
      .eq("organization_id", row.organization_id)
      .single()
    expect(link?.token).toBe(row.link_token)
    expect(link?.default_role).toBe("ADMIN")

    const registrant = await makeUser("bootstrap-registrant", {})
    cleanup.push(registrant.id)
    const { error: regError } = await registrant.client.rpc("complete_registration", {
      p_token: row.link_token,
      p_first_name: "Nueva",
      p_last_name: "Admin",
      p_phone: "099123456",
      p_dni: "12345678",
    })
    expect(regError).toBeNull()

    const { data: membership } = await supabaseAdmin
      .from("organization_memberships")
      .select("role, status")
      .eq("organization_id", row.organization_id)
      .eq("user_id", registrant.id)
      .single()
    expect(membership?.role).toBe("ADMIN")
    expect(membership?.status).toBe("ACTIVE")
  })

  it("a non-platform-admin cannot create an organization (42501)", async () => {
    const student = await member("bootstrap-non-admin", ORG_A, "STUDENT")
    const { error } = await student.client.rpc("create_organization", {
      p_name: "Should Not Exist",
      p_slug: `should-not-exist-${Date.now()}`,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("score_scale_ranges exclusion constraint", () => {
  it("raises 23P01 when a new range overlaps an existing one", async () => {
    const adminA = await member("bootstrap-scale-admin", ORG_A, "ADMIN")
    const { error } = await adminA.client.from("score_scale_ranges").insert({
      organization_id: ORG_A,
      label: "Overlap test",
      min_score: 65,
      max_score: 75,
      is_passing: true,
    })
    expect(error?.code).toBe("23P01")
  })
})
