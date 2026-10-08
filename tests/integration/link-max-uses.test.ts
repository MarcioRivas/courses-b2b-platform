import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { anonClient, deleteUser, makeUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const createdLinkIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  if (createdLinkIds.length > 0) {
    await supabaseAdmin.from("organization_registration_links").delete().in("id", createdLinkIds)
  }
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

async function createLink(maxUses: number | null) {
  const admin = await member("mu-admin", ORG_A, "ADMIN")
  const { data, error } = await admin.client.rpc("create_registration_link", {
    p_org: ORG_A,
    p_label: "Max usos",
    p_role: "STUDENT",
    ...(maxUses === null ? {} : { p_max_uses: maxUses }),
  })
  expect(error).toBeNull()
  const link = data?.[0]
  if (!link) throw new Error("link not created")
  createdLinkIds.push(link.id)
  return link
}

async function register(token: string) {
  const user = await makeUser("mu-registrant", {})
  cleanup.push(user.id)
  const { error } = await user.client.rpc("complete_registration", {
    p_token: token,
    p_first_name: "Nuevo",
    p_last_name: "Miembro",
    p_phone: "099123456",
    p_dni: randomUUID().replace(/-/g, "").slice(0, 10),
  })
  return error
}

describe("registration link max_uses", () => {
  it("rejects a non-positive max_uses", async () => {
    const admin = await member("mu-admin-bad", ORG_A, "ADMIN")
    const { error } = await admin.client.rpc("create_registration_link", {
      p_org: ORG_A,
      p_label: "Mal",
      p_role: "STUDENT",
      p_max_uses: 0,
    })
    expect(error).not.toBeNull()
  })

  it("blocks the (max+1)th registration with LINK_EXHAUSTED and reports exhausted publicly", async () => {
    const link = await createLink(2)

    expect(await register(link.token)).toBeNull()
    expect(await register(link.token)).toBeNull()

    const third = await register(link.token)
    expect(third?.code).toBe("22023")
    expect(third?.message).toContain("LINK_EXHAUSTED")

    const { data: row } = await supabaseAdmin
      .from("organization_registration_links")
      .select("use_count")
      .eq("id", link.id)
      .single()
    expect(row?.use_count).toBe(2)

    const { data } = await anonClient().rpc("get_registration_link_public", { p_token: link.token })
    expect(data?.[0]).toMatchObject({ valid: false, exhausted: true })
  })

  it("an unlimited link keeps accepting and reports valid", async () => {
    const link = await createLink(null)
    expect(await register(link.token)).toBeNull()
    const { data } = await anonClient().rpc("get_registration_link_public", { p_token: link.token })
    expect(data?.[0]).toMatchObject({ valid: true, exhausted: false })
  })

  it("two concurrent registrations at max-1 -> exactly one succeeds", async () => {
    const link = await createLink(2)
    expect(await register(link.token)).toBeNull()

    const [a, b] = await Promise.all([register(link.token), register(link.token)])
    const failures = [a, b].filter((error) => error !== null)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.message).toContain("LINK_EXHAUSTED")

    const { data: row } = await supabaseAdmin
      .from("organization_registration_links")
      .select("use_count")
      .eq("id", link.id)
      .single()
    expect(row?.use_count).toBe(2)
  })
})
