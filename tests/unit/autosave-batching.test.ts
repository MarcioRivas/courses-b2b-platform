import { describe, expect, it } from "vitest"
import {
  ANSWER_TEXT_MAX,
  RETRY_DELAYS_MS,
  bumpDirty,
  raiseSeqCounters,
  reconcileAccepted,
  seedFromMirror,
  toAnswerPayload,
  type DirtyMap,
} from "@/features/attempts/lib/dirty-map"
import { answerSchema } from "@/features/attempts/schemas/attempt-schemas"

describe("bumpDirty", () => {
  it("seeds the counter from the server snapshot so resume never goes backwards (D4)", () => {
    const seqCounters = new Map([["q1", 7]])
    const { map, seqCounters: nextCounters } = bumpDirty(new Map(), seqCounters, "q1", { selectedOptionId: "opt-a" })

    expect(map.get("q1")?.clientSeq).toBe(8)
    expect(nextCounters.get("q1")).toBe(8)
  })

  it("increments monotonically on every edit, even to the same question", () => {
    let map: DirtyMap = new Map()
    let seqCounters = new Map<string, number>()

    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "a" }))
    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "b" }))
    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "c" }))

    expect(map.get("q1")).toEqual({ attemptQuestionId: "q1", selectedOptionId: "c", textAnswer: undefined, clientSeq: 3 })
  })

  it("keeps counters independent per question", () => {
    let map: DirtyMap = new Map()
    let seqCounters = new Map<string, number>()

    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "a" }))
    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q2", { textAnswer: "hi" }))
    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "b" }))

    expect(map.get("q1")?.clientSeq).toBe(2)
    expect(map.get("q2")?.clientSeq).toBe(1)
  })

  it("preserves the other field on a partial patch", () => {
    let map: DirtyMap = new Map()
    let seqCounters = new Map<string, number>()

    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { textAnswer: "draft" }))
    ;({ map, seqCounters } = bumpDirty(map, seqCounters, "q1", { textAnswer: "draft v2" }))

    expect(map.get("q1")?.textAnswer).toBe("draft v2")
  })

  it("never reuses a seq the dirty map already holds, even if the counter fell behind (H1)", () => {
    // Simulates a reseed where the counter is stale relative to the dirty
    // entry it should be tracking (e.g. right after `seedFromMirror`).
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "a", clientSeq: 5 }]])
    const seqCounters = new Map([["q1", 3]])
    const { map: next } = bumpDirty(map, seqCounters, "q1", { selectedOptionId: "b" })
    expect(next.get("q1")?.clientSeq).toBe(6)
  })
})

describe("reconcileAccepted", () => {
  it("removes an entry the server accepted at the same seq it was sent with", () => {
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "a", clientSeq: 1 }]])
    const sent = [{ attemptQuestionId: "q1", clientSeq: 1 }]
    const next = reconcileAccepted(map, sent, [{ attempt_question_id: "q1", client_seq: 1 }])
    expect(next.has("q1")).toBe(false)
  })

  it("never drops a newer local edit made while the request was in flight", () => {
    // The request went out with seq 1; before the response came back, the
    // student edited again locally, bumping the dirty entry to seq 2.
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "b", clientSeq: 2 }]])
    const sent = [{ attemptQuestionId: "q1", clientSeq: 1 }]
    const next = reconcileAccepted(map, sent, [{ attempt_question_id: "q1", client_seq: 1 }])

    expect(next.has("q1")).toBe(true)
    expect(next.get("q1")?.clientSeq).toBe(2)
  })

  it("leaves unrelated dirty questions untouched", () => {
    const map: DirtyMap = new Map([
      ["q1", { attemptQuestionId: "q1", selectedOptionId: "a", clientSeq: 1 }],
      ["q2", { attemptQuestionId: "q2", textAnswer: "x", clientSeq: 1 }],
    ])
    const sent = [{ attemptQuestionId: "q1", clientSeq: 1 }]
    const next = reconcileAccepted(map, sent, [{ attempt_question_id: "q1", client_seq: 1 }])

    expect(next.has("q1")).toBe(false)
    expect(next.has("q2")).toBe(true)
  })

  it("is a no-op when nothing was sent", () => {
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "a", clientSeq: 1 }]])
    expect(reconcileAccepted(map, [], [])).toBe(map)
  })

  it("H1: clears a sent seq even when accepted is empty — the server already held it", () => {
    // `save_answers_batch` omits an answer from `accepted` when its own
    // stored seq is already >= what was sent — this is the "already-held"
    // case, not a failure, and must not linger forever re-sending no-ops.
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "a", clientSeq: 4 }]])
    const sent = [{ attemptQuestionId: "q1", clientSeq: 4 }]
    const next = reconcileAccepted(map, sent, [])
    expect(next.has("q1")).toBe(false)
  })

  it("H1: keeps a newer edit made after the send, even when accepted is empty", () => {
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "c", clientSeq: 6 }]])
    const sent = [{ attemptQuestionId: "q1", clientSeq: 4 }]
    const next = reconcileAccepted(map, sent, [])
    expect(next.get("q1")?.clientSeq).toBe(6)
  })
})

describe("raiseSeqCounters", () => {
  it("raises a counter to the accepted seq when it would otherwise be lower", () => {
    const next = raiseSeqCounters(new Map([["q1", 2]]), [{ attempt_question_id: "q1", client_seq: 5 }])
    expect(next.get("q1")).toBe(5)
  })

  it("never lowers a counter that is already ahead", () => {
    const next = raiseSeqCounters(new Map([["q1", 9]]), [{ attempt_question_id: "q1", client_seq: 5 }])
    expect(next.get("q1")).toBe(9)
  })
})

describe("seedFromMirror (H1 reload scenario)", () => {
  it("seeds the counter from max(server, mirror) and applies the mirror value when it is newer", () => {
    // Reproduces the reported bug: server snapshot says seq 3, but the
    // sessionStorage mirror (an un-reconciled keepalive flush) says seq 5.
    const serverQuestions = [
      { attemptQuestionId: "q1", clientSeq: 3, selectedOptionId: "old", textAnswer: null },
    ]
    const mirror = [{ attemptQuestionId: "q1", selectedOptionId: "new", clientSeq: 5 }]

    const { seqCounters, dirty, values } = seedFromMirror(serverQuestions, mirror)

    expect(seqCounters.get("q1")).toBe(5)
    expect(dirty.get("q1")?.clientSeq).toBe(5)
    expect(values.get("q1")?.selectedOptionId).toBe("new")
  })

  it("ignores a stale mirror entry that is behind the server's own seq", () => {
    const serverQuestions = [
      { attemptQuestionId: "q1", clientSeq: 7, selectedOptionId: "server-value", textAnswer: null },
    ]
    const mirror = [{ attemptQuestionId: "q1", selectedOptionId: "stale", clientSeq: 2 }]

    const { seqCounters, dirty, values } = seedFromMirror(serverQuestions, mirror)

    expect(seqCounters.get("q1")).toBe(7)
    expect(dirty.has("q1")).toBe(false)
    expect(values.get("q1")?.selectedOptionId).toBe("server-value")
  })

  it("a subsequent edit after seeding never regresses below the mirror's seq", () => {
    const serverQuestions = [
      { attemptQuestionId: "q1", clientSeq: 3, selectedOptionId: "old", textAnswer: null },
    ]
    const mirror = [{ attemptQuestionId: "q1", selectedOptionId: "new", clientSeq: 5 }]
    const { seqCounters } = seedFromMirror(serverQuestions, mirror)

    const { map } = bumpDirty(new Map(), seqCounters, "q1", { selectedOptionId: "newer" })
    expect(map.get("q1")?.clientSeq).toBe(6)
  })
})

describe("toAnswerPayload", () => {
  it("maps to the RPC's snake_case shape with nulls for unset fields", () => {
    const map: DirtyMap = new Map([["q1", { attemptQuestionId: "q1", selectedOptionId: "opt-a", clientSeq: 4 }]])
    expect(toAnswerPayload(map)).toEqual([
      { attempt_question_id: "q1", selected_option_id: "opt-a", text_answer: null, client_seq: 4 },
    ])
  })
})

describe("RETRY_DELAYS_MS", () => {
  it("is the documented 500/1000/2000ms backoff (D4/5D step 14)", () => {
    expect(RETRY_DELAYS_MS).toEqual([500, 1000, 2000])
  })
})

describe("ANSWER_TEXT_MAX cap parity (N3)", () => {
  it("equals save_answers_batch's own text_answer cap (20260911210400)", () => {
    expect(ANSWER_TEXT_MAX).toBe(20000)
  })

  it("the Zod schema rejects one character past the cap and accepts exactly the cap", () => {
    const base = { attempt_question_id: "11111111-1111-4111-8111-111111111111", client_seq: 1 }
    expect(answerSchema.safeParse({ ...base, text_answer: "a".repeat(ANSWER_TEXT_MAX) }).success).toBe(true)
    expect(answerSchema.safeParse({ ...base, text_answer: "a".repeat(ANSWER_TEXT_MAX + 1) }).success).toBe(false)
  })
})
