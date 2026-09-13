import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const createdLinkIds: string[] = []

afterAll(async () => {
  if (createdLinkIds.length > 0) {
    await supabaseAdmin.from("organization_registration_links").delete().in("id", createdLinkIds)
  }
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

describe("create_registration_link: role restriction (D23)", () => {
  it("an org admin cannot create an ADMIN-role link in their own org", async () => {
    const adminA = await member("reglink-admin-a", ORG_A, "ADMIN")

    const { error } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Intento admin",
      p_role: "ADMIN",
    })

    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Only a platform admin can create ADMIN registration links")
  })

  it("a platform admin can create an ADMIN-role link for any org", async () => {
    const platformAdmin = await member("reglink-platform-admin", ORG_A, "STUDENT")
    await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

    const { data, error } = await platformAdmin.client.rpc("create_registration_link", {
      p_org: ORG_B,
      p_label: "Admin inicial",
      p_role: "ADMIN",
    })

    expect(error).toBeNull()
    const link = data?.[0]
    expect(link?.id).toBeTruthy()
    expect(link?.token).toBeTruthy()
    if (link?.id) createdLinkIds.push(link.id)
  })

  it("an org admin can create a STUDENT link in their own org, and it is audited", async () => {
    const adminA = await member("reglink-valid-admin-a", ORG_A, "ADMIN")

    const { data, error } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Ingreso temporada",
      p_role: "STUDENT",
    })

    expect(error).toBeNull()
    const link = data?.[0]
    expect(link?.id).toBeTruthy()
    if (link?.id) createdLinkIds.push(link.id)

    const { data: audited } = await adminA.client
      .from("audit_logs")
      .select("action")
      .eq("entity_id", link!.id)
      .eq("action", "registration_link.created")
    expect(audited).toHaveLength(1)
  })
})

describe("create_registration_link: expiry defaults and validation", () => {
  it("defaults expires_at to ~30 days when p_expires_at is omitted", async () => {
    const adminA = await member("reglink-default-expiry-admin-a", ORG_A, "ADMIN")

    const { data, error } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Sin vencimiento explícito",
      p_role: "STUDENT",
    })

    expect(error).toBeNull()
    const link = data?.[0]
    if (link?.id) createdLinkIds.push(link.id)

    const { data: row } = await supabaseAdmin
      .from("organization_registration_links")
      .select("expires_at, created_at")
      .eq("id", link!.id)
      .single()

    const expiresAt = new Date(row!.expires_at!).getTime()
    const createdAt = new Date(row!.created_at).getTime()
    const daysUntilExpiry = (expiresAt - createdAt) / (1000 * 60 * 60 * 24)
    expect(daysUntilExpiry).toBeGreaterThan(29)
    expect(daysUntilExpiry).toBeLessThan(31)
  })

  it("rejects a p_expires_at in the past", async () => {
    const adminA = await member("reglink-past-expiry-admin-a", ORG_A, "ADMIN")

    const { error } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Vencimiento pasado",
      p_role: "STUDENT",
      p_expires_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    })

    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("Expiry must be in the future")
  })
})

describe("registration link tokens are never readable by non-admins (D27/D37)", () => {
  it("a student in the same org gets 0 rows when selecting tokens", async () => {
    const adminA = await member("reglink-visibility-admin-a", ORG_A, "ADMIN")
    const studentA = await member("reglink-visibility-student-a", ORG_A, "STUDENT")

    const { data: created } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Visibilidad",
      p_role: "STUDENT",
    })
    const link = created?.[0]
    if (link?.id) createdLinkIds.push(link.id)

    const { data, error } = await studentA.client
      .from("organization_registration_links")
      .select("id, token")
      .eq("id", link!.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it("the org admin who created it can read the token back", async () => {
    const adminA = await member("reglink-owner-read-admin-a", ORG_A, "ADMIN")

    const { data: created } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Lectura propia",
      p_role: "STUDENT",
    })
    const link = created?.[0]
    if (link?.id) createdLinkIds.push(link.id)

    const { data, error } = await adminA.client
      .from("organization_registration_links")
      .select("id, token")
      .eq("id", link!.id)
      .single()

    expect(error).toBeNull()
    expect(data?.token).toBe(link?.token)
  })
})
