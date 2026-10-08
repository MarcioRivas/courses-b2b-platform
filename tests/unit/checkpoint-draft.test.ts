import { describe, expect, it } from "vitest"
import type { EditorCheckpoint } from "@/features/video-checkpoints/types"
import { toDraft, toPayload, setCorrectOption } from "@/features/video-checkpoints/lib/checkpoint-draft"

describe("checkpoint-draft", () => {
  const mockCheckpoint: EditorCheckpoint = {
    id: "cp-1",
    atSeconds: 30,
    minCorrect: 1,
    questions: [
      {
        id: "q-1",
        prompt: "Question 1?",
        options: [
          { id: "o-1", label: "Yes", isCorrect: true },
          { id: "o-2", label: "No", isCorrect: false },
        ],
      },
    ],
  }

  describe("toDraft", () => {
    it("converts editor checkpoints to draft format with keys", () => {
      const drafts = toDraft([mockCheckpoint])
      expect(drafts).toHaveLength(1)
      expect(drafts[0]?.id).toBe("cp-1")
      expect(drafts[0]?.key).toBe("cp-1")
      expect(drafts[0]?.atSeconds).toBe(30)
    })

    it("generates keys for questions and options", () => {
      const drafts = toDraft([mockCheckpoint])
      const draft = drafts[0]!
      expect(draft.questions[0]?.key).toBeDefined()
      expect(draft.questions[0]?.id).toBe("q-1")
      expect(draft.questions[0]?.options[0]?.key).toBeDefined()
      expect(draft.questions[0]?.options[0]?.id).toBe("o-1")
    })

    it("handles multiple checkpoints", () => {
      const cp2: EditorCheckpoint = {
        id: "cp-2",
        atSeconds: 75,
        minCorrect: 1,
        questions: [{ id: "q-2", prompt: "Q2?", options: [{ id: "o-3", label: "A", isCorrect: true }] }],
      }
      const drafts = toDraft([mockCheckpoint, cp2])
      expect(drafts).toHaveLength(2)
      expect(drafts[0]?.atSeconds).toBe(30)
      expect(drafts[1]?.atSeconds).toBe(75)
    })

    it("generates unique keys for items without ids", () => {
      const checkpointNoId: EditorCheckpoint = {
        atSeconds: 45,
        minCorrect: 1,
        questions: [{ prompt: "New Q?", options: [{ label: "Opt", isCorrect: true }] }],
      }
      const drafts = toDraft([checkpointNoId])
      expect(drafts[0]?.key).toBeDefined()
      expect(drafts[0]?.id).toBeUndefined()
    })

    it("preserves structure and values", () => {
      const drafts = toDraft([mockCheckpoint])
      const draft = drafts[0]!
      expect(draft.minCorrect).toBe(1)
      expect(draft.questions[0]?.prompt).toBe("Question 1?")
      expect(draft.questions[0]?.options[0]?.label).toBe("Yes")
      expect(draft.questions[0]?.options[0]?.isCorrect).toBe(true)
    })
  })

  describe("toPayload", () => {
    it("strips client keys from draft format", () => {
      const drafts = toDraft([mockCheckpoint])
      const payload = toPayload(drafts)
      expect(payload[0]?.atSeconds).toBe(30)
      expect(payload[0]?.questions[0]?.options[0]?.label).toBe("Yes")
      // keys should not appear in payload
      expect(Object.keys(payload[0]!).includes("key")).toBe(false)
    })

    it("preserves database ids", () => {
      const drafts = toDraft([mockCheckpoint])
      const payload = toPayload(drafts)
      expect(payload[0]?.id).toBe("cp-1")
      expect(payload[0]?.questions[0]?.id).toBe("q-1")
      expect(payload[0]?.questions[0]?.options[0]?.id).toBe("o-1")
    })

    it("omits ids when not present in draft", () => {
      const draft = toDraft([
        {
          atSeconds: 30,
          minCorrect: 1,
          questions: [{ prompt: "Q?", options: [{ label: "A", isCorrect: true }] }],
        },
      ])
      const payload = toPayload(draft)
      expect(payload[0]?.id).toBeUndefined()
      expect(payload[0]?.questions[0]?.id).toBeUndefined()
    })

    it("sorts checkpoints by atSeconds", () => {
      const cp1: EditorCheckpoint = { id: "cp1", atSeconds: 75, minCorrect: 1, questions: [{ prompt: "Q", options: [{ label: "A", isCorrect: true }] }] }
      const cp2: EditorCheckpoint = { id: "cp2", atSeconds: 30, minCorrect: 1, questions: [{ prompt: "Q", options: [{ label: "A", isCorrect: true }] }] }
      const cp3: EditorCheckpoint = { id: "cp3", atSeconds: 60, minCorrect: 1, questions: [{ prompt: "Q", options: [{ label: "A", isCorrect: true }] }] }
      const drafts = toDraft([cp1, cp2, cp3])
      const payload = toPayload(drafts)
      expect(payload[0]?.id).toBe("cp2")
      expect(payload[1]?.id).toBe("cp3")
      expect(payload[2]?.id).toBe("cp1")
    })

    it("clamps minCorrect when questions are removed", () => {
      const draft = toDraft([mockCheckpoint])
      draft[0]!.minCorrect = 3
      draft[0]!.questions = [] // Remove all questions
      const payload = toPayload(draft)
      // minCorrect should be clamped to Math.max(0, 1) = 1
      expect(payload[0]?.minCorrect).toBe(1)
    })

    it("clamps minCorrect to question count", () => {
      const draft = toDraft([mockCheckpoint])
      draft[0]!.minCorrect = 5
      draft[0]!.questions = [draft[0]!.questions[0]!] // Only 1 question
      const payload = toPayload(draft)
      expect(payload[0]?.minCorrect).toBe(1)
    })

    it("keeps valid minCorrect when within bounds", () => {
      const draft = toDraft([mockCheckpoint])
      draft[0]!.minCorrect = 1
      draft[0]!.questions = [
        draft[0]!.questions[0]!,
        { key: "q2", prompt: "Q2?", options: [{ key: "o", label: "A", isCorrect: true }] },
      ]
      const payload = toPayload(draft)
      expect(payload[0]?.minCorrect).toBe(1)
    })

    it("handles multiple checkpoints in order", () => {
      const drafts = toDraft([
        { id: "c1", atSeconds: 100, minCorrect: 1, questions: [{ prompt: "Q", options: [{ label: "A", isCorrect: true }] }] },
        { id: "c2", atSeconds: 50, minCorrect: 1, questions: [{ prompt: "Q", options: [{ label: "A", isCorrect: true }] }] },
      ])
      const payload = toPayload(drafts)
      expect(payload[0]?.atSeconds).toBe(50)
      expect(payload[1]?.atSeconds).toBe(100)
    })
  })

  describe("setCorrectOption", () => {
    it("marks one option correct and others incorrect", () => {
      const draft = toDraft([mockCheckpoint])
      const question = draft[0]!.questions[0]!
      const optionKey = question.options[1]!.key

      const updated = setCorrectOption(question, optionKey)
      expect(updated.options[0]?.isCorrect).toBe(false)
      expect(updated.options[1]?.isCorrect).toBe(true)
    })

    it("changes correct option from one to another", () => {
      const draft = toDraft([mockCheckpoint])
      const question = draft[0]!.questions[0]!

      let updated = setCorrectOption(question, question.options[1]!.key)
      expect(updated.options[1]?.isCorrect).toBe(true)

      updated = setCorrectOption(updated, question.options[0]!.key)
      expect(updated.options[0]?.isCorrect).toBe(true)
      expect(updated.options[1]?.isCorrect).toBe(false)
    })

    it("preserves other question properties", () => {
      const draft = toDraft([mockCheckpoint])
      const question = draft[0]!.questions[0]!
      const originalKey = question.key
      const originalId = question.id

      const updated = setCorrectOption(question, question.options[1]!.key)
      expect(updated.key).toBe(originalKey)
      expect(updated.id).toBe(originalId)
      expect(updated.prompt).toBe(question.prompt)
    })

    it("preserves option labels and ids", () => {
      const draft = toDraft([mockCheckpoint])
      const question = draft[0]!.questions[0]!

      const updated = setCorrectOption(question, question.options[1]!.key)
      question.options.forEach((opt, idx) => {
        expect(updated.options[idx]?.label).toBe(opt.label)
        expect(updated.options[idx]?.id).toBe(opt.id)
        expect(updated.options[idx]?.key).toBe(opt.key)
      })
    })

    it("handles questions with many options", () => {
      const manyOptions = [
        { label: "A", isCorrect: false },
        { label: "B", isCorrect: false },
        { label: "C", isCorrect: true },
        { label: "D", isCorrect: false },
        { label: "E", isCorrect: false },
      ]
      const question = {
        key: "q1",
        prompt: "Multi-option question",
        options: manyOptions.map((opt) => ({ key: Math.random().toString(), ...opt })),
      }

      const updated = setCorrectOption(question, question.options[2]!.key)
      expect(updated.options[2]?.isCorrect).toBe(true)
      expect(updated.options.filter((o) => o.isCorrect)).toHaveLength(1)
    })
  })
})
