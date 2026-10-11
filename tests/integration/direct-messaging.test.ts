import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { createMemberFactory } from "../helpers/membership"
import { makeUser, type TestUser } from "../helpers/make-user"
import { supabaseAdmin } from "../helpers/supabase-admin"

/**
 * Direct messaging (1:1, same org only). Real local Supabase: RLS on
 * conversations/messages, the messaging RPCs and Realtime tenant isolation.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const member = createMemberFactory(cleanup)

let studentA: TestUser
let studentA2: TestUser
let professorA: TestUser
let adminA: TestUser
let inactiveA: TestUser
let studentB: TestUser
let platformAdmin: TestUser

beforeAll(async () => {
  ;[studentA, studentA2, professorA, adminA, studentB] = await Promise.all([
    member("dm-student-a", ORG_A, "STUDENT"),
    member("dm-student-a2", ORG_A, "STUDENT"),
    member("dm-professor-a", ORG_A, "PROFESSOR"),
    member("dm-admin-a", ORG_A, "ADMIN"),
    member("dm-student-b", ORG_B, "STUDENT"),
  ])
  inactiveA = await makeUser("dm-inactive-a", { organizationId: ORG_A, role: "STUDENT", status: "INACTIVE" })
  cleanup.push(inactiveA.id)
  platformAdmin = await makeUser("dm-platform")
  cleanup.push(platformAdmin.id)
  await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })
})

afterAll(async () => {
  for (const id of cleanup) {
    await supabaseAdmin.auth.admin.deleteUser(id)
  }
})

async function start(from: TestUser, to: TestUser): Promise<string> {
  const { data, error } = await from.client.rpc("start_conversation", { p_user: to.id })
  if (error || !data) throw error ?? new Error("no conversation id")
  return data
}

async function send(from: TestUser, conversationId: string, body: string) {
  return from.client.rpc("send_message", { p_conversation: conversationId, p_body: body })
}

async function setMembershipStatus(user: TestUser, status: "ACTIVE" | "INACTIVE") {
  const { error } = await supabaseAdmin.from("organization_memberships").update({ status }).eq("user_id", user.id)
  if (error) throw error
}

describe("start_conversation", () => {
  it("creates one conversation per pair, whoever starts it", async () => {
    const first = await start(studentA, professorA)
    const again = await start(studentA, professorA)
    const reverse = await start(professorA, studentA)
    expect(again).toBe(first)
    expect(reverse).toBe(first)
  })

  it("lets every role pair of the same org talk (student↔student, admin↔student)", async () => {
    await expect(start(studentA, studentA2)).resolves.toBeTruthy()
    await expect(start(adminA, studentA)).resolves.toBeTruthy()
  })

  it("refuses a member of another org with the same NOT_FOUND as an unknown id", async () => {
    const crossOrg = await studentA.client.rpc("start_conversation", { p_user: studentB.id })
    const unknown = await studentA.client.rpc("start_conversation", { p_user: crypto.randomUUID() })
    expect(crossOrg.error?.message).toContain("NOT_FOUND")
    expect(unknown.error?.message).toContain("NOT_FOUND")
  })

  it("refuses an inactive member, yourself and a platform admin caller", async () => {
    const inactive = await studentA.client.rpc("start_conversation", { p_user: inactiveA.id })
    expect(inactive.error?.message).toContain("NOT_FOUND")

    const self = await studentA.client.rpc("start_conversation", { p_user: studentA.id })
    expect(self.error?.message).toContain("SELF_CONVERSATION")

    const platform = await platformAdmin.client.rpc("start_conversation", { p_user: studentA.id })
    expect(platform.error?.code).toBe("42501")
  })
})

describe("send_message", () => {
  it("stores a trimmed message visible to both participants only", async () => {
    const conversationId = await start(studentA, professorA)
    const { data, error } = await send(studentA, conversationId, "  Hola profe  ")
    expect(error).toBeNull()
    expect(data?.[0]?.body).toBe("Hola profe")

    const seenByProfessor = await professorA.client.from("messages").select("id").eq("conversation_id", conversationId)
    expect(seenByProfessor.data?.map((row) => row.id)).toContain(data?.[0]?.id)

    // Same org, not a participant: nothing, not even the conversation row.
    for (const outsider of [studentA2, adminA, studentB, platformAdmin]) {
      const messages = await outsider.client.from("messages").select("id").eq("conversation_id", conversationId)
      const conversations = await outsider.client.from("conversations").select("id").eq("id", conversationId)
      expect(messages.data ?? []).toHaveLength(0)
      expect(conversations.data ?? []).toHaveLength(0)
    }
  })

  it("refuses non-participants, including another org guessing the id", async () => {
    const conversationId = await start(studentA, professorA)
    for (const outsider of [studentA2, studentB, platformAdmin]) {
      const { error } = await send(outsider, conversationId, "intruso")
      expect(error?.code).toBe("42501")
    }
  })

  it("rejects empty, blank and over-long bodies", async () => {
    const conversationId = await start(studentA, studentA2)
    for (const body of ["", "   \n\t ", "x".repeat(4001)]) {
      const { error } = await send(studentA, conversationId, body)
      expect(error?.message).toContain("INVALID_BODY")
    }
    const { error } = await send(studentA, conversationId, "x".repeat(4000))
    expect(error).toBeNull()
  })

  it("blocks direct writes: no INSERT/UPDATE/DELETE on messages or conversations", async () => {
    const conversationId = await start(studentA, professorA)
    const insert = await studentA.client
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: studentA.id, recipient_id: professorA.id, body: "directo" })
    expect(insert.error).not.toBeNull()

    const update = await studentA.client.from("conversations").update({ user_a_last_read_at: null }).eq("id", conversationId)
    expect(update.error).not.toBeNull()
  })

  it("makes the chat read-only once the other member is deactivated, history stays readable", async () => {
    const peer = await member("dm-peer", ORG_A, "STUDENT")
    const conversationId = await start(studentA, peer)
    await send(studentA, conversationId, "antes")

    await setMembershipStatus(peer, "INACTIVE")
    const { error } = await send(studentA, conversationId, "después")
    expect(error?.message).toContain("MEMBER_INACTIVE")

    const history = await studentA.client.from("messages").select("body").eq("conversation_id", conversationId)
    expect(history.data?.map((row) => row.body)).toEqual(["antes"])

    const header = await studentA.client.rpc("my_conversations", { p_conversation: conversationId })
    expect(header.data?.[0]?.other_is_active).toBe(false)
    expect(header.data?.[0]?.other_first_name).toBe("Test")

    // The deactivated member loses access entirely.
    const lost = await peer.client.from("messages").select("id").eq("conversation_id", conversationId)
    expect(lost.data ?? []).toHaveLength(0)
  })

  it("is idempotent on the client id: a retried send returns the stored message, never a copy", async () => {
    const conversationId = await start(studentA, professorA)
    const clientId = crypto.randomUUID()
    const first = await studentA.client.rpc("send_message", {
      p_conversation: conversationId,
      p_body: "una sola vez",
      p_client_id: clientId,
    })
    const retry = await studentA.client.rpc("send_message", {
      p_conversation: conversationId,
      p_body: "una sola vez",
      p_client_id: clientId,
    })
    expect(first.data?.[0]?.id).toBe(clientId)
    expect(retry.data?.[0]).toEqual(first.data?.[0])

    const stored = await supabaseAdmin.from("messages").select("id, recipient_id").eq("id", clientId)
    expect(stored.data).toEqual([{ id: clientId, recipient_id: professorA.id }])

    // Someone else's message id cannot be "retried" into your own send.
    const hijack = await professorA.client.rpc("send_message", {
      p_conversation: conversationId,
      p_body: "x",
      p_client_id: clientId,
    })
    expect(hijack.error?.code).toBe("42501")
  })

  it("rate-limits a sender at 30 messages per minute", async () => {
    const sender = await member("dm-flood", ORG_A, "STUDENT")
    const conversationId = await start(sender, studentA)
    for (let i = 0; i < 30; i++) {
      const { error } = await send(sender, conversationId, `msg ${i}`)
      expect(error).toBeNull()
    }
    const { error } = await send(sender, conversationId, "uno más")
    expect(error?.message).toContain("RATE_LIMITED")
  })
})

describe("inbox and unread state", () => {
  it("lists conversations with preview and unread count; mark read clears it", async () => {
    const sender = await member("dm-inbox-sender", ORG_A, "PROFESSOR")
    const reader = await member("dm-inbox-reader", ORG_A, "STUDENT")
    const conversationId = await start(sender, reader)

    // A conversation without messages is not in the inbox yet.
    const empty = await reader.client.rpc("my_conversations", {})
    expect(empty.data ?? []).toHaveLength(0)

    await send(sender, conversationId, "primero")
    await send(sender, conversationId, "segundo")

    const inbox = await reader.client.rpc("my_conversations", {})
    expect(inbox.data).toHaveLength(1)
    expect(inbox.data?.[0]).toMatchObject({
      conversation_id: conversationId,
      other_user_id: sender.id,
      other_role: "PROFESSOR",
      last_message_body: "segundo",
      unread_count: 2,
    })
    expect((await reader.client.rpc("my_unread_message_count")).data).toBe(2)

    // The sender's own messages never count as unread for them.
    expect((await sender.client.rpc("my_unread_message_count")).data).toBe(0)

    const { error } = await reader.client.rpc("mark_conversation_read", { p_conversation: conversationId })
    expect(error).toBeNull()
    expect((await reader.client.rpc("my_unread_message_count")).data).toBe(0)

    const outsider = await studentB.client.rpc("mark_conversation_read", { p_conversation: conversationId })
    expect(outsider.error?.code).toBe("42501")
  })

  it("marks read only up to the message the client showed, never backwards", async () => {
    const sender = await member("dm-upto-sender", ORG_A, "STUDENT")
    const reader = await member("dm-upto-reader", ORG_A, "STUDENT")
    const conversationId = await start(sender, reader)
    const shown = (await send(sender, conversationId, "visto")).data?.[0]
    await send(sender, conversationId, "llegó mientras cargaba")

    await reader.client.rpc("mark_conversation_read", { p_conversation: conversationId, p_up_to: shown!.created_at })
    expect((await reader.client.rpc("my_unread_message_count")).data).toBe(1)

    await reader.client.rpc("mark_conversation_read", { p_conversation: conversationId })
    expect((await reader.client.rpc("my_unread_message_count")).data).toBe(0)

    // An older marker never moves it back.
    await reader.client.rpc("mark_conversation_read", { p_conversation: conversationId, p_up_to: shown!.created_at })
    expect((await reader.client.rpc("my_unread_message_count")).data).toBe(0)
  })

  it("keeps read markers private: no read receipts through a direct select", async () => {
    const conversationId = await start(studentA, professorA)
    const markers = await studentA.client
      .from("conversations")
      .select("user_a_last_read_at, user_b_last_read_at")
      .eq("id", conversationId)
    expect(markers.error?.code).toBe("42501")

    const safe = await studentA.client.from("conversations").select("id, last_message_at").eq("id", conversationId)
    expect(safe.data).toHaveLength(1)
  })

  it("never returns another participant's conversation by id", async () => {
    const conversationId = await start(studentA, professorA)
    const peek = await studentA2.client.rpc("my_conversations", { p_conversation: conversationId })
    expect(peek.data ?? []).toHaveLength(0)
  })
})

describe("search_messageable_members", () => {
  it("returns only ACTIVE members of the caller's org, never the caller", async () => {
    const named = await makeUser("dm-search-target", {
      organizationId: ORG_A,
      role: "PROFESSOR",
      firstName: "Zacarías",
      lastName: "Buscable",
    })
    const foreign = await makeUser("dm-search-foreign", {
      organizationId: ORG_B,
      role: "STUDENT",
      firstName: "Zacarías",
      lastName: "Buscable",
    })
    cleanup.push(named.id, foreign.id)

    const { data, error } = await studentA.client.rpc("search_messageable_members", { p_q: "Buscable" })
    expect(error).toBeNull()
    expect(data?.map((row) => row.user_id)).toEqual([named.id])
    expect(data?.[0]?.role).toBe("PROFESSOR")

    const self = await named.client.rpc("search_messageable_members", { p_q: "Buscable" })
    expect(self.data ?? []).toHaveLength(0)

    const short = await studentA.client.rpc("search_messageable_members", { p_q: "Z" })
    expect(short.data ?? []).toHaveLength(0)

    // `%` is escaped: it does not match everyone.
    const wildcard = await studentA.client.rpc("search_messageable_members", { p_q: "%%" })
    expect(wildcard.data ?? []).toHaveLength(0)

    const platform = await platformAdmin.client.rpc("search_messageable_members", { p_q: "Buscable" })
    expect(platform.error?.code).toBe("42501")
  })
})

describe("realtime isolation", () => {
  async function listen(user: TestUser, received: string[]) {
    const client = user.client as SupabaseClient<Database>
    const { data } = await client.auth.getSession()
    await client.realtime.setAuth(data.session?.access_token ?? null)
    const channel = client.channel(`test-${user.id}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => received.push((payload.new as { body: string }).body)
    )
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve()
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status))
      })
    })
    return () => client.removeChannel(channel)
  }

  it("pushes a message to the recipient and to nobody outside the conversation", async () => {
    const recipientEvents: string[] = []
    const sameOrgEvents: string[] = []
    const otherOrgEvents: string[] = []
    const stops = await Promise.all([
      listen(professorA, recipientEvents),
      listen(studentA2, sameOrgEvents),
      listen(studentB, otherOrgEvents),
    ])
    // Realtime needs a moment after SUBSCRIBED before postgres_changes flow.
    await new Promise((resolve) => setTimeout(resolve, 2500))

    const conversationId = await start(studentA, professorA)
    const body = `realtime ${crypto.randomUUID()}`
    await send(studentA, conversationId, body)

    const deadline = Date.now() + 10000
    while (!recipientEvents.includes(body) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    // Give leaks the same chance to arrive before asserting they did not.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await Promise.all(stops.map((stop) => stop()))

    expect(recipientEvents).toContain(body)
    expect(sameOrgEvents).not.toContain(body)
    expect(otherOrgEvents).not.toContain(body)
  }, 30000)
})
