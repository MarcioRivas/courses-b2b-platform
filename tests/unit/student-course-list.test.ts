import { describe, expect, it } from "vitest"
import type { AvailableCourse, StudentEnrollment } from "@/features/enrollments/types"
import {
  buildCourseList,
  enrollmentState,
  orderForAll,
  orderForMine,
} from "@/features/enrollments/lib/student-course-list"
import { filterCourseList, normalizeSearchText } from "@/features/enrollments/lib/filter-student-courses"
import type { CourseListParams } from "@/features/enrollments/schemas/course-list-params-schema"

/** Fixed clock: the pure model takes `now`, so nothing reads the host date. */
const NOW = new Date("2026-10-15T12:00:00.000Z")

function enrollment(
  overrides: Partial<StudentEnrollment> & { id: string; courseTitle: string }
): StudentEnrollment {
  return {
    status: "ACTIVE",
    source: "FREE_COURSE",
    progressPercent: 0,
    completedBlocks: 0,
    totalBlocks: 4,
    completedAt: null,
    courseId: `course-${overrides.id}`,
    courseDescription: null,
    offeringName: "Edición 2026",
    endsAt: null,
    closed: false,
    lastActivityAt: "2026-10-01T10:00:00.000Z",
    resumeLessonId: null,
    ...overrides,
  }
}

function available(id: string, title: string): AvailableCourse {
  return { id, title, description: null, moduleCount: 3 }
}

function titles(items: { title: string }[]): string[] {
  return items.map((item) => item.title)
}

describe("enrollmentState", () => {
  it("maps COMPLETED to FINISHED, even when the course is also closed", () => {
    expect(enrollmentState(enrollment({ id: "1", courseTitle: "A", status: "COMPLETED", closed: true }), NOW)).toBe(
      "FINISHED"
    )
  })

  it("maps an archived course or cancelled edition (closed flag) to CLOSED", () => {
    expect(enrollmentState(enrollment({ id: "1", courseTitle: "A", closed: true, completedBlocks: 2 }), NOW)).toBe(
      "CLOSED"
    )
  })

  it("maps an edition whose endsAt is in the past to CLOSED", () => {
    const e = enrollment({ id: "1", courseTitle: "A", endsAt: "2026-10-14T23:59:59.000Z" })
    expect(enrollmentState(e, NOW)).toBe("CLOSED")
  })

  it("keeps an edition ending in the future open", () => {
    const e = enrollment({ id: "1", courseTitle: "A", endsAt: "2026-12-01T00:00:00.000Z" })
    expect(enrollmentState(e, NOW)).toBe("NOT_STARTED")
  })

  it("compares instants, not dates: endsAt 1 ms before now is CLOSED, equal to now is open", () => {
    const justBefore = enrollment({ id: "1", courseTitle: "A", endsAt: "2026-10-15T11:59:59.999Z" })
    const exactlyNow = enrollment({ id: "2", courseTitle: "B", endsAt: NOW.toISOString() })
    expect(enrollmentState(justBefore, NOW)).toBe("CLOSED")
    expect(enrollmentState(exactlyNow, NOW)).toBe("NOT_STARTED")
  })

  it("maps an active enrollment with completed blocks to IN_PROGRESS", () => {
    expect(enrollmentState(enrollment({ id: "1", courseTitle: "A", completedBlocks: 1 }), NOW)).toBe("IN_PROGRESS")
  })

  it("maps an active enrollment with zero completed blocks to NOT_STARTED", () => {
    expect(enrollmentState(enrollment({ id: "1", courseTitle: "A", completedBlocks: 0 }), NOW)).toBe("NOT_STARTED")
  })
})

describe("buildCourseList", () => {
  it("keeps enrollments in server order and appends available courses sorted by title (es)", () => {
    const items = buildCourseList(
      [enrollment({ id: "e1", courseTitle: "Zeta" }), enrollment({ id: "e2", courseTitle: "Alfa" })],
      [available("c2", "Módulo final"), available("c1", "Anatomía"), available("c3", "Bioquímica")],
      NOW
    )
    expect(titles(items)).toEqual(["Zeta", "Alfa", "Anatomía", "Bioquímica", "Módulo final"])
    expect(items.map((item) => item.kind)).toEqual([
      "enrollment",
      "enrollment",
      "available",
      "available",
      "available",
    ])
  })

  it("labels available courses AVAILABLE and derives enrollment states with the injected now", () => {
    const items = buildCourseList(
      [enrollment({ id: "e1", courseTitle: "Cerrado", closed: true })],
      [available("c1", "Nuevo")],
      NOW
    )
    expect(items[0]!.state).toBe("CLOSED")
    expect(items[1]!.state).toBe("AVAILABLE")
    expect(items[1]!.key).toBe("c:c1")
    expect(items[0]!.key).toBe("e:e1")
  })

  it("does not mutate the input available array", () => {
    const input = [available("c2", "Zeta"), available("c1", "Alfa")]
    buildCourseList([], input, NOW)
    expect(titles(input)).toEqual(["Zeta", "Alfa"])
  })
})

describe("orderForAll (Todos)", () => {
  it("lists in progress (most recent activity first), then not started, then available; excludes FINISHED and CLOSED", () => {
    const items = buildCourseList(
      [
        enrollment({ id: "old", courseTitle: "Progreso viejo", completedBlocks: 1, lastActivityAt: "2026-10-02T09:00:00.000Z" }),
        enrollment({ id: "new", courseTitle: "Progreso nuevo", completedBlocks: 2, lastActivityAt: "2026-10-10T09:00:00.000Z" }),
        enrollment({ id: "sin", courseTitle: "Sin empezar", completedBlocks: 0 }),
        enrollment({ id: "fin", courseTitle: "Terminado", status: "COMPLETED", completedBlocks: 4, completedAt: "2026-10-05T00:00:00.000Z" }),
        enrollment({ id: "cer", courseTitle: "Cerrado", closed: true, completedBlocks: 1 }),
      ],
      [available("c1", "Disponible")],
      NOW
    )
    expect(titles(orderForAll(items))).toEqual([
      "Progreso nuevo",
      "Progreso viejo",
      "Sin empezar",
      "Disponible",
    ])
  })

  it("keeps not-started enrollments in input order (newest enrollment first)", () => {
    const items = buildCourseList(
      [
        enrollment({ id: "a", courseTitle: "Primero inscripto" }),
        enrollment({ id: "b", courseTitle: "Segundo inscripto" }),
        enrollment({ id: "c", courseTitle: "Tercero inscripto" }),
      ],
      [],
      NOW
    )
    expect(titles(orderForAll(items))).toEqual(["Primero inscripto", "Segundo inscripto", "Tercero inscripto"])
  })

  it("returns an empty list when everything is finished or closed", () => {
    const items = buildCourseList(
      [
        enrollment({ id: "f", courseTitle: "F", status: "COMPLETED" }),
        enrollment({ id: "c", courseTitle: "C", closed: true }),
      ],
      [],
      NOW
    )
    expect(orderForAll(items)).toEqual([])
  })
})

describe("orderForMine (Mis cursos)", () => {
  const items = buildCourseList(
    [
      enrollment({ id: "p1", courseTitle: "En progreso A", completedBlocks: 1, lastActivityAt: "2026-10-03T00:00:00.000Z" }),
      enrollment({ id: "p2", courseTitle: "En progreso B", completedBlocks: 3, lastActivityAt: "2026-10-09T00:00:00.000Z" }),
      enrollment({ id: "s1", courseTitle: "Sin empezar", completedBlocks: 0 }),
      enrollment({ id: "f1", courseTitle: "Finalizado viejo", status: "COMPLETED", completedAt: "2026-09-01T00:00:00.000Z" }),
      enrollment({ id: "f2", courseTitle: "Finalizado nuevo", status: "COMPLETED", completedAt: "2026-10-01T00:00:00.000Z" }),
      enrollment({ id: "c1", courseTitle: "Cerrado", closed: true, completedBlocks: 2 }),
    ],
    [available("a1", "Disponible no entra")],
    NOW
  )

  it("lists every enrollment: in progress → not started → finished (completedAt desc) → closed", () => {
    expect(titles(orderForMine(items))).toEqual([
      "En progreso B",
      "En progreso A",
      "Sin empezar",
      "Finalizado nuevo",
      "Finalizado viejo",
      "Cerrado",
    ])
  })

  it("never includes available courses", () => {
    expect(titles(orderForMine(items))).not.toContain("Disponible no entra")
  })
})

describe("filterCourseList", () => {
  const items = buildCourseList(
    [
      enrollment({ id: "1", courseTitle: "Introducción a la economía", completedBlocks: 1 }),
      enrollment({ id: "2", courseTitle: "Historia del Uruguay" }),
      enrollment({ id: "3", courseTitle: "Matemática básica", status: "COMPLETED" }),
    ],
    [available("a1", "Introducción a la filosofía"), available("a2", "Ñandú y señas")],
    NOW
  )

  const params = (overrides: Partial<CourseListParams> = {}): CourseListParams => ({
    vista: "todos",
    ...overrides,
  })

  it("matches accent-insensitively: 'introduccion' finds 'Introducción'", () => {
    expect(titles(filterCourseList(items, params({ q: "introduccion" })))).toEqual([
      "Introducción a la economía",
      "Introducción a la filosofía",
    ])
  })

  it("matches case-insensitively and ignores surrounding spaces in the query", () => {
    expect(titles(filterCourseList(items, params({ q: "  HISTORIA " })))).toEqual(["Historia del Uruguay"])
  })

  it("matches ñ as n (normalized) in both directions", () => {
    expect(titles(filterCourseList(items, params({ q: "nandu" })))).toEqual(["Ñandú y señas"])
    expect(titles(filterCourseList(items, params({ q: "ñandú" })))).toEqual(["Ñandú y señas"])
  })

  it("returns nothing when no title contains the query", () => {
    expect(filterCourseList(items, params({ q: "zzz" }))).toEqual([])
  })

  it("empty or whitespace query keeps the whole vista", () => {
    expect(filterCourseList(items, params({ q: "   " }))).toHaveLength(orderForAll(items).length)
    expect(filterCourseList(items, params({ q: "" }))).toHaveLength(orderForAll(items).length)
  })

  it("narrows within the vista: disponibles searches only available courses", () => {
    expect(titles(filterCourseList(items, params({ vista: "disponibles", q: "introduccion" })))).toEqual([
      "Introducción a la filosofía",
    ])
  })

  it("narrows within mis-cursos, finished courses included", () => {
    expect(titles(filterCourseList(items, params({ vista: "mis-cursos", q: "matem" })))).toEqual([
      "Matemática básica",
    ])
  })

  it("normalizeSearchText strips diacritics and lowercases", () => {
    expect(normalizeSearchText("  Introducción ÑANDÚ ")).toBe("introduccion nandu")
  })
})
