import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { anonClient } from "../helpers/make-user"
import { createRegistrantFactory, ORG_A, ORG_B, TOKEN_A } from "../helpers/registration-fixtures"
import { supabaseAdmin } from "../helpers/supabase-admin"

const registrants = createRegistrantFactory()
afterAll(() => registrants.cleanup())

describe("get_registration_link_public", () => {
  it("valid token returns valid=true + org name", async () => {
    const { data, error } = await anonClient().rpc("get_registration_link_public", { p_token: TOKEN_A })
    expect(error).toBeNull()
    expect(data?.[0]?.valid).toBe(true)
    expect(data?.[0]?.organization_name).toBe("Club Atlético Demo")
  })

  it("unknown token returns valid=false", async () => {
    const { data, error } = await anonClient().rpc("get_registration_link_public", {
      p_token: `unknown-${randomUUID()}`,
    })
    expect(error).toBeNull()
    expect(data?.[0]?.valid).toBe(false)
  })
})

describe("complete_registration", () => {
  it("creates profile + profile_private + ACTIVE STUDENT membership in org A only", async () => {
    const user = await registrants.create("reg-creates")

    const { data: orgId, error } = await user.client.rpc("complete_registration", {
      p_token: TOKEN_A,
      p_first_name: "Nuevo",
      p_last_name: "Registrado",
      p_phone: "099123456",
      p_dni: "12345678",
    })
    expect(error).toBeNull()
    expect(orgId).toBe(ORG_A)

    const { data: membershipA } = await supabaseAdmin
      .from("organization_memberships")
      .select("status, role")
      .eq("organization_id", ORG_A)
      .eq("user_id", user.id)
      .single()
    expect(membershipA).toMatchObject({ status: "ACTIVE", role: "STUDENT" })

    const { data: membershipB } = await supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", ORG_B)
      .eq("user_id", user.id)
    expect(membershipB).toHaveLength(0)

    const { data: priv } = await supabaseAdmin
      .from("profile_private")
      .select("phone, dni")
      .eq("user_id", user.id)
      .single()
    expect(priv).toMatchObject({ phone: "099123456", dni: "12345678" })
  })

  it("increments use_count on the demo link", async () => {
    const before = await supabaseAdmin
      .from("organization_registration_links")
      .select("use_count")
      .eq("token", TOKEN_A)
      .single()

    const user = await registrants.create("reg-use-count")
    await user.client.rpc("complete_registration", {
      p_token: TOKEN_A,
      p_first_name: "Contador",
      p_last_name: "Uso",
      p_phone: "099000000",
      p_dni: "00000000",
    })

    const after = await supabaseAdmin
      .from("organization_registration_links")
      .select("use_count")
      .eq("token", TOKEN_A)
      .single()
    // TOKEN_A is the shared demo link (also used by the E2E suite); assert monotonic
    // increase rather than an exact delta to avoid cross-suite flakiness.
    expect(after.data?.use_count ?? 0).toBeGreaterThan(before.data?.use_count ?? 0)
  })

  it("two concurrent calls on one fresh token both succeed and use_count increments exactly twice", async () => {
    const token = `test-concurrent-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: ORG_A,
      token,
      default_role: "STUDENT",
      is_active: true,
    })

    const [userOne, userTwo] = await Promise.all([
      registrants.create("reg-concurrent-1"),
      registrants.create("reg-concurrent-2"),
    ])

    const results = await Promise.all(
      [userOne, userTwo].map((user) =>
        user.client.rpc("complete_registration", {
          p_token: token,
          p_first_name: "Concurrente",
          p_last_name: "Test",
          p_phone: "099444444",
          p_dni: `${Math.floor(Math.random() * 1e8)}`,
        })
      )
    )
    expect(results[0]?.error).toBeNull()
    expect(results[1]?.error).toBeNull()

    const { data: link } = await supabaseAdmin
      .from("organization_registration_links")
      .select("use_count")
      .eq("token", token)
      .single()
    expect(link?.use_count).toBe(2)

    await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
  })
})
