import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { anonClient, deleteUser, makeUser } from "../helpers/make-user"
import { createRegistrantFactory, ORG_A, TOKEN_A } from "../helpers/registration-fixtures"
import { supabaseAdmin } from "../helpers/supabase-admin"

const registrants = createRegistrantFactory()
afterAll(() => registrants.cleanup())

describe("complete_registration rejections", () => {
  it("rejects an expired link", async () => {
    const token = `test-expired-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: ORG_A,
      token,
      default_role: "STUDENT",
      is_active: true,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    })

    const user = await registrants.create("reg-expired")
    const { error } = await user.client.rpc("complete_registration", {
      p_token: token,
      p_first_name: "Expirado",
      p_last_name: "Link",
      p_phone: "099111111",
      p_dni: "11111111",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("expired")

    await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
  })

  it("rejects a revoked link", async () => {
    const token = `test-revoked-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: ORG_A,
      token,
      default_role: "STUDENT",
      is_active: true,
      revoked_at: new Date().toISOString(),
    })

    const user = await registrants.create("reg-revoked")
    const { error } = await user.client.rpc("complete_registration", {
      p_token: token,
      p_first_name: "Revocado",
      p_last_name: "Link",
      p_phone: "099222222",
      p_dni: "22222222",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("no longer active")

    await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
  })

  it("rejects an anonymous (no session) call", async () => {
    // anon has no EXECUTE grant on complete_registration at all (C2), so
    // Postgres denies the call before the function body's own auth.uid()
    // check ever runs — same guard, enforced one layer earlier.
    const { error } = await anonClient().rpc("complete_registration", {
      p_token: TOKEN_A,
      p_first_name: "Anon",
      p_last_name: "User",
      p_phone: "099333333",
      p_dni: "33333333",
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("permission denied for function complete_registration")
  })

  it("rejects registration into an INACTIVE organization (D29)", async () => {
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Scratch Org Inactive", slug: `scratch-inactive-${Date.now()}`, status: "INACTIVE" })
      .select("id")
      .single()
    if (orgError || !org) throw orgError ?? new Error("failed to create scratch org")

    const token = `test-inactive-org-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: org.id,
      token,
      default_role: "STUDENT",
      is_active: true,
    })

    try {
      const user = await registrants.create("reg-inactive-org")
      const { error } = await user.client.rpc("complete_registration", {
        p_token: token,
        p_first_name: "Inactivo",
        p_last_name: "Org",
        p_phone: "099777777",
        p_dni: "77777777",
      })
      expect(error?.code).toBe("22023")
      expect(error?.message).toContain("not active")
    } finally {
      await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
      await supabaseAdmin.from("organizations").delete().eq("id", org.id)
    }
  })

  it("a second registration by the same user on the same org is a conflict and does not bump use_count (W8)", async () => {
    const token = `test-double-reg-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: ORG_A,
      token,
      default_role: "STUDENT",
      is_active: true,
    })

    try {
      const user = await registrants.create("reg-double")

      const first = await user.client.rpc("complete_registration", {
        p_token: token,
        p_first_name: "Primera",
        p_last_name: "Vez",
        p_phone: "099888888",
        p_dni: "88888888",
      })
      expect(first.error).toBeNull()

      const { data: afterFirst } = await supabaseAdmin
        .from("organization_registration_links")
        .select("use_count")
        .eq("token", token)
        .single()
      expect(afterFirst?.use_count).toBe(1)

      const second = await user.client.rpc("complete_registration", {
        p_token: token,
        p_first_name: "Segunda",
        p_last_name: "Vez",
        p_phone: "099999999",
        p_dni: "99999999",
      })
      expect(second.error?.code).toBe("23505")
      expect(second.error?.message).toContain("already registered")

      const { data: afterSecond } = await supabaseAdmin
        .from("organization_registration_links")
        .select("use_count")
        .eq("token", token)
        .single()
      expect(afterSecond?.use_count).toBe(1)
    } finally {
      await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
    }
  })

  it("rejects an INACTIVE existing membership and does not touch profile/use_count (D29)", async () => {
    const token = `test-inactive-member-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: ORG_A,
      token,
      default_role: "STUDENT",
      is_active: true,
    })

    const admin = await makeUser("reg-inactive-admin", { organizationId: ORG_A, role: "ADMIN" })
    try {
      const user = await registrants.create("reg-inactive-member")

      const first = await user.client.rpc("complete_registration", {
        p_token: token,
        p_first_name: "Primera",
        p_last_name: "Vez",
        p_phone: "099444444",
        p_dni: "44444444",
      })
      expect(first.error).toBeNull()

      const { data: membership } = await supabaseAdmin
        .from("organization_memberships")
        .select("id")
        .eq("organization_id", ORG_A)
        .eq("user_id", user.id)
        .single()
      if (!membership) throw new Error("membership not found")

      const { error: deactivateError } = await admin.client.rpc("set_membership_status", {
        p_membership: membership.id,
        p_status: "INACTIVE",
      })
      expect(deactivateError).toBeNull()

      const { data: linkBefore } = await supabaseAdmin
        .from("organization_registration_links")
        .select("use_count")
        .eq("token", token)
        .single()

      const second = await user.client.rpc("complete_registration", {
        p_token: token,
        p_first_name: "Segunda",
        p_last_name: "Vez",
        p_phone: "099000000",
        p_dni: "00000000",
      })
      expect(second.error?.code).toBe("42501")
      expect(second.error?.message).toContain("inactive")

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .single()
      expect(profile?.first_name).toBe("Primera")

      const { data: linkAfter } = await supabaseAdmin
        .from("organization_registration_links")
        .select("use_count")
        .eq("token", token)
        .single()
      expect(linkAfter?.use_count).toBe(linkBefore?.use_count)
    } finally {
      await deleteUser(admin.id)
      await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
    }
  })
})

describe("update_my_profile", () => {
  it("updates profiles and profile_private for the caller only", async () => {
    const user = await registrants.create("reg-update-profile")
    await user.client.rpc("complete_registration", {
      p_token: TOKEN_A,
      p_first_name: "Antes",
      p_last_name: "Cambio",
      p_phone: "099555555",
      p_dni: "55555555",
    })

    const { error } = await user.client.rpc("update_my_profile", {
      p_first_name: "Despues",
      p_last_name: "Cambio",
      p_phone: "099666666",
      p_dni: "66666666",
    })
    expect(error).toBeNull()

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name")
      .eq("id", user.id)
      .single()
    expect(profile?.first_name).toBe("Despues")

    const { data: priv } = await supabaseAdmin
      .from("profile_private")
      .select("phone")
      .eq("user_id", user.id)
      .single()
    expect(priv?.phone).toBe("099666666")
  })
})
