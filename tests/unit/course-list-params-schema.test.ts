import { describe, expect, it } from "vitest"
import {
  defaultCourseView,
  resolveCourseListParams,
  serializeCourseListParams,
} from "@/features/enrollments/schemas/course-list-params-schema"

describe("resolveCourseListParams", () => {
  it("defaults to Todos when the student has enrollments", () => {
    expect(resolveCourseListParams({}, true)).toEqual({ vista: "todos", q: undefined })
  })

  it("defaults to Disponibles when the student has no enrollments (first course)", () => {
    expect(resolveCourseListParams({}, false)).toEqual({ vista: "disponibles", q: undefined })
  })

  it("honours an explicit valid vista regardless of enrollments", () => {
    expect(resolveCourseListParams({ vista: "disponibles" }, true).vista).toBe("disponibles")
    expect(resolveCourseListParams({ vista: "mis-cursos" }, false).vista).toBe("mis-cursos")
  })

  it("falls back to the default vista for an unknown vista value", () => {
    expect(resolveCourseListParams({ vista: "foo" }, true).vista).toBe("todos")
    expect(resolveCourseListParams({ vista: "foo" }, false).vista).toBe("disponibles")
    expect(resolveCourseListParams({ vista: "" }, true).vista).toBe("todos")
  })

  it("ignores the removed estado param", () => {
    expect(resolveCourseListParams({ vista: "mis-cursos", estado: "terminados" }, true)).toEqual({
      vista: "mis-cursos",
      q: undefined,
    })
  })

  it("takes the first value when a param arrives as an array", () => {
    const params = resolveCourseListParams(
      { vista: ["mis-cursos", "disponibles"], q: ["a", "b"] },
      true
    )
    expect(params).toEqual({ vista: "mis-cursos", q: "a" })
  })

  it("trims q and drops an empty one", () => {
    expect(resolveCourseListParams({ q: "   " }, true).q).toBeUndefined()
    expect(resolveCourseListParams({ q: "  historia  " }, true).q).toBe("historia")
  })

  it("keeps q of exactly 100 characters", () => {
    const q = "a".repeat(100)
    expect(resolveCourseListParams({ q }, true).q).toBe(q)
  })

  it("drops a q longer than 100 characters instead of failing", () => {
    const params = resolveCourseListParams({ vista: "disponibles", q: "a".repeat(101) }, true)
    expect(params).toEqual({ vista: "disponibles", q: undefined })
  })

  it("does not throw on a q of 500 characters", () => {
    expect(() => resolveCourseListParams({ q: "x".repeat(500) }, false)).not.toThrow()
    expect(resolveCourseListParams({ q: "x".repeat(500) }, false).q).toBeUndefined()
  })

  it("ignores unrelated keys", () => {
    expect(resolveCourseListParams({ foo: "bar", page: "2" }, true)).toEqual({
      vista: "todos",
      q: undefined,
    })
  })
})

describe("defaultCourseView", () => {
  it("is todos with enrollments and disponibles without", () => {
    expect(defaultCourseView(true)).toBe("todos")
    expect(defaultCourseView(false)).toBe("disponibles")
  })
})

describe("serializeCourseListParams", () => {
  it("omits everything at its default: plain /learn stays clean", () => {
    expect(serializeCourseListParams({ vista: "todos" }, true)).toBe("")
    expect(serializeCourseListParams({ vista: "disponibles" }, false)).toBe("")
  })

  it("writes a non-default vista", () => {
    expect(serializeCourseListParams({ vista: "disponibles" }, true)).toBe("?vista=disponibles")
    expect(serializeCourseListParams({ vista: "todos" }, false)).toBe("?vista=todos")
  })

  it("encodes q", () => {
    expect(serializeCourseListParams({ vista: "todos", q: "historia del uruguay" }, true)).toBe(
      "?q=historia+del+uruguay"
    )
  })

  it("round-trips through resolve", () => {
    const cases = [
      { params: { vista: "mis-cursos" as const, q: "mate" }, hasEnrollments: true },
      { params: { vista: "disponibles" as const, q: "introducción" }, hasEnrollments: true },
      { params: { vista: "todos" as const }, hasEnrollments: false },
      { params: { vista: "disponibles" as const }, hasEnrollments: false },
    ]
    for (const { params, hasEnrollments } of cases) {
      const query = serializeCourseListParams(params, hasEnrollments)
      const search = Object.fromEntries(new URLSearchParams(query))
      expect(resolveCourseListParams(search, hasEnrollments)).toEqual({
        vista: params.vista,
        q: "q" in params ? params.q : undefined,
      })
    }
  })
})
