import { describe, expect, it } from "vitest"
import {
  changeDraftType,
  moveDraft,
  newQuestionDraft,
  rebaseDrafts,
  toQuestionDraft,
  totalPoints,
  validateDrafts,
} from "@/features/assessments/lib/question-draft"

describe("question drafts", () => {
  it("a new MC draft starts with two options, the first correct; open-ended has none", () => {
    const mc = newQuestionDraft("MULTIPLE_CHOICE")
    expect(mc.options).toEqual([
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
    ])
    expect(newQuestionDraft("OPEN_ENDED").options).toEqual([])
    expect(mc.key).not.toBe(newQuestionDraft("MULTIPLE_CHOICE").key)
  })

  it("maps a stored question keeping its id as key", () => {
    const draft = toQuestionDraft({ id: "q1", type: "OPEN_ENDED", prompt: "¿?", points: 2, options: [] })
    expect(draft).toMatchObject({ key: "q1", id: "q1", points: "2" })
  })

  it("switching to MC adds options only when missing", () => {
    const open = { ...newQuestionDraft("OPEN_ENDED"), prompt: "Hola" }
    const mc = changeDraftType(open, "MULTIPLE_CHOICE")
    expect(mc.prompt).toBe("Hola")
    expect(mc.options).toHaveLength(2)
    expect(changeDraftType(mc, "MULTIPLE_CHOICE")).toBe(mc)
  })

  it("moves within bounds only", () => {
    const [a, b] = [newQuestionDraft("OPEN_ENDED"), newQuestionDraft("OPEN_ENDED")]
    expect(moveDraft([a, b], 0, 1)).toEqual([b, a])
    const same = [a, b]
    expect(moveDraft(same, 0, -1)).toBe(same)
  })

  it("validates every draft and keys errors by draft", () => {
    const ok = { ...newQuestionDraft("MULTIPLE_CHOICE"), prompt: "Bien", options: [{ label: "a", isCorrect: true }, { label: "b", isCorrect: false }] }
    const bad = { ...newQuestionDraft("OPEN_ENDED"), prompt: "" }
    const result = validateDrafts([ok, bad])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([bad.key])

    const valid = validateDrafts([ok])
    expect(valid.ok && valid.payload[0]).toMatchObject({ type: "MULTIPLE_CHOICE", prompt: "Bien", points: 1 })
  })

  it("rebases drafts onto saved ids and totals points", () => {
    const drafts = [newQuestionDraft("OPEN_ENDED"), { ...newQuestionDraft("OPEN_ENDED"), points: "2.5" }]
    expect(rebaseDrafts(drafts, ["x", "y"]).map((d) => d.id)).toEqual(["x", "y"])
    expect(totalPoints(drafts)).toBe(3.5)
  })
})
