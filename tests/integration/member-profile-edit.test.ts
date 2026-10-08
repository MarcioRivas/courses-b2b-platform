import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { deleteUser, makeUser, type TestUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const member = createMemberFactory(cleanup)
afterAll(() => Promise.all(cleanup.map((id) => deleteUser(id))))

function uniqueDni(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10)
}

function edit(caller: TestUser, userId: string, overrides: Record<string, string> = {}) {
  return caller.client.rpc("admin_update_member_profile", {
    p_user: userId,
    p_first_name: "Nuevo",
    p_last_name: "Nombre",
    p_phone: "099 123-456",
    p_dni: uniqueDni(),
    ...overrides,
  })
}

describe("admin_update_member_profile", () => {
  it("an org admin updates a member of their org and the change is audited with old/new values", async () => {
    const admin = await member("pe-admin", ORG_A, "ADMIN")
    const student = await member("pe-student", ORG_A, "STUDENT")
    const dni = uniqueDni()

    const { error } = await edit(admin, student.id, { p_dni: dni, p_phone: "+598 99 123456" })
    expect(error).toBeNull()

    const { data: priv } = await supabaseAdmin
      .from("profile_private")
      .select("phone, dni")
      .eq("user_id", student.id)
      .single()
    expect(priv).toEqual({ phone: "+598 99 123456", dni })

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", student.id)
      .single()
    expect(profile).toEqual({ first_name: "Nuevo", last_name: "Nombre" })

    const { data: audit } = await supabaseAdmin
      .from("audit_logs")
      .select("organization_id, actor_user_id, metadata")
      .eq("entity_id", student.id)
      .eq("action", "member.profile_updated")
    expect(audit).toHaveLength(1)
    expect(audit?.[0]).toMatchObject({ organization_id: ORG_A, actor_user_id: admin.id })
    expect(audit?.[0]?.metadata).toMatchObject({
      from: { first_name: "Test", last_name: "User", dni: null },
      to: { first_name: "Nuevo", last_name: "Nombre", dni },
    })
  })

  it("an admin of another org is refused", async () => {
    const adminB = await member("pe-admin-b", ORG_B, "ADMIN")
    const student = await member("pe-student-a", ORG_A, "STUDENT")

    const { error } = await edit(adminB, student.id)
    expect(error?.code).toBe("42501")
  })

  it("a student caller is refused", async () => {
    const caller = await member("pe-student-caller", ORG_A, "STUDENT")
    const victim = await member("pe-student-victim", ORG_A, "STUDENT")

    const { error } = await edit(caller, victim.id)
    expect(error?.code).toBe("42501")
  })

  it("an ORG_ADMIN subject is refused for an org admin", async () => {
    const admin = await member("pe-admin-1", ORG_A, "ADMIN")
    const otherAdmin = await member("pe-admin-2", ORG_A, "ADMIN")

    const { error } = await edit(admin, otherAdmin.id)
    expect(error?.code).toBe("42501")
  })

  it("a member of two orgs is refused for an org admin but allowed for a platform admin", async () => {
    const admin = await member("pe-admin-multi", ORG_A, "ADMIN")
    const shared = await member("pe-shared", ORG_A, "STUDENT")
    await supabaseAdmin
      .from("organization_memberships")
      .insert({ organization_id: ORG_B, user_id: shared.id, role: "STUDENT" })

    const refused = await edit(admin, shared.id)
    expect(refused.error?.code).toBe("42501")

    const platformAdmin = await member("pe-platform", ORG_A, "STUDENT")
    await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

    const allowed = await edit(platformAdmin, shared.id)
    expect(allowed.error).toBeNull()
  })

  it("rejects a DNI already used by another member of the same org (DNI_TAKEN), case-insensitive", async () => {
    const admin = await member("pe-admin-dni", ORG_A, "ADMIN")
    const first = await member("pe-dni-first", ORG_A, "STUDENT")
    const second = await member("pe-dni-second", ORG_A, "STUDENT")
    const dni = `ab${uniqueDni()}`

    expect((await edit(admin, first.id, { p_dni: dni })).error).toBeNull()

    const { error } = await edit(admin, second.id, { p_dni: ` ${dni.toUpperCase()} ` })
    expect(error?.code).toBe("23505")
    expect(error?.message).toContain("DNI_TAKEN")

    // Re-saving one's own DNI is not a conflict.
    expect((await edit(admin, first.id, { p_dni: dni })).error).toBeNull()
  })

  it("treats DNIs as equal ignoring punctuation and case, and accepts ( ) . in phones", async () => {
    const admin = await member("pe-admin-norm", ORG_A, "ADMIN")
    const first = await member("pe-norm-first", ORG_A, "STUDENT")
    const second = await member("pe-norm-second", ORG_A, "STUDENT")
    const digits = String(Math.floor(1e7 + Math.random() * 9e7))

    const ok = await edit(admin, first.id, { p_dni: `${digits.slice(0, 2)}.${digits.slice(2)}-X`, p_phone: "(099) 123.456" })
    expect(ok.error).toBeNull()

    const { error } = await edit(admin, second.id, { p_dni: `${digits}x` })
    expect(error?.message).toContain("DNI_TAKEN")
  })

  it.each([
    ["empty first name", { p_first_name: "   " }],
    ["too-long last name", { p_last_name: "x".repeat(81) }],
    ["short phone", { p_phone: "123" }],
    ["phone with letters", { p_phone: "099abc123" }],
    ["short dni", { p_dni: "123" }],
    ["too-long dni", { p_dni: "1".repeat(16) }],
  ])("rejects invalid data: %s (INVALID_PROFILE)", async (_label, overrides) => {
    const admin = await member("pe-admin-invalid", ORG_A, "ADMIN")
    const student = await member("pe-student-invalid", ORG_A, "STUDENT")

    const { error } = await edit(admin, student.id, overrides)
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("INVALID_PROFILE")
  })

  it("refuses an INACTIVE-only member (must be an ACTIVE member)", async () => {
    const admin = await member("pe-admin-inactive", ORG_A, "ADMIN")
    const inactive = await makeUser("pe-inactive", { organizationId: ORG_A, role: "STUDENT", status: "INACTIVE" })
    cleanup.push(inactive.id)

    const { error } = await edit(admin, inactive.id)
    expect(error?.code).toBe("42501")
  })
})

describe("complete_registration profile validation and DNI uniqueness", () => {
  it("rejects invalid profile data and a DNI already used in the org", async () => {
    const admin = await member("pe-reg-admin", ORG_A, "ADMIN")
    const existing = await member("pe-reg-existing", ORG_A, "STUDENT")
    const dni = uniqueDni()
    expect((await edit(admin, existing.id, { p_dni: dni })).error).toBeNull()

    const token = `test-profile-${randomUUID()}`
    await supabaseAdmin
      .from("organization_registration_links")
      .insert({ organization_id: ORG_A, token, default_role: "STUDENT", is_active: true })

    const newcomer = await makeUser("pe-reg-newcomer", {})
    cleanup.push(newcomer.id)
    const base = { p_token: token, p_first_name: "Ana", p_last_name: "Perez", p_phone: "099123456" }

    const invalid = await newcomer.client.rpc("complete_registration", { ...base, p_dni: "12" })
    expect(invalid.error?.message).toContain("INVALID_PROFILE")

    const taken = await newcomer.client.rpc("complete_registration", { ...base, p_dni: dni })
    expect(taken.error?.code).toBe("23505")
    expect(taken.error?.message).toContain("DNI_TAKEN")

    await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
  })
})
