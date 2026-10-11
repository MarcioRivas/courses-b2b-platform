import { describe, expect, it } from "vitest"
import { loadMessagesSchema, markConversationReadSchema, searchMembersSchema, sendMessageSchema } from "./messaging-schemas"
import { messagingRpcErrorResult } from "../lib/messaging-errors"

const ID = "6f1c2a4e-8b1d-4c3a-9e2f-1a2b3c4d5e6f"

describe("sendMessageSchema", () => {
  it("trims the body and accepts up to 4000 chars", () => {
    expect(sendMessageSchema.parse({ conversationId: ID, clientId: ID, body: "  hola  " }).body).toBe("hola")
    expect(sendMessageSchema.safeParse({ conversationId: ID, clientId: ID, body: "x".repeat(4000) }).success).toBe(true)
  })

  it("rejects blank and over-long bodies and a bad id", () => {
    expect(sendMessageSchema.safeParse({ conversationId: ID, clientId: ID, body: " \n\t " }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ conversationId: ID, clientId: ID, body: "x".repeat(4001) }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ conversationId: "nope", clientId: ID, body: "hola" }).success).toBe(false)
  })
})

describe("searchMembersSchema", () => {
  it("needs at least 2 non-blank chars", () => {
    expect(searchMembersSchema.safeParse({ query: " a " }).success).toBe(false)
    expect(searchMembersSchema.safeParse({ query: "an" }).success).toBe(true)
  })
})

describe("loadMessagesSchema / markConversationReadSchema", () => {
  const PG_TIMESTAMP = "2026-10-11T17:49:19.00586+00:00"

  it("accepts the timestamp format Postgres returns (microseconds, +00:00)", () => {
    const cursor = { createdAt: PG_TIMESTAMP, id: ID }
    expect(loadMessagesSchema.safeParse({ conversationId: ID, direction: "older", cursor }).success).toBe(true)
    expect(markConversationReadSchema.safeParse({ conversationId: ID, upTo: PG_TIMESTAMP }).success).toBe(true)
  })

  it("rejects cursors that could inject into the PostgREST filter", () => {
    const bad = [
      { createdAt: "ayer", id: ID },
      { createdAt: `${PG_TIMESTAMP}",id.gt.0`, id: ID },
      { createdAt: PG_TIMESTAMP, id: "x),or(id.gt.0" },
    ]
    for (const cursor of bad) {
      expect(loadMessagesSchema.safeParse({ conversationId: ID, direction: "older", cursor }).success).toBe(false)
    }
  })
})

describe("messagingRpcErrorResult", () => {
  it("maps domain codes raised by the RPCs", () => {
    expect(messagingRpcErrorResult({ message: "MEMBER_INACTIVE", code: "42501" })).toMatchObject({ code: "FORBIDDEN" })
    expect(messagingRpcErrorResult({ message: "RATE_LIMITED", code: "42501" })).toMatchObject({ code: "LOCKED" })
    expect(messagingRpcErrorResult({ message: "NOT_FOUND", code: "P0002" })).toMatchObject({ code: "NOT_FOUND" })
    expect(messagingRpcErrorResult({ message: "SELF_CONVERSATION" })).toMatchObject({ code: "VALIDATION" })
  })

  it("never leaks a raw Postgres message", () => {
    const result = messagingRpcErrorResult({ message: 'relation "x" does not exist', code: "42P01" })
    expect(result.code).toBe("INTERNAL")
    expect(result.message).not.toContain("relation")
  })
})
