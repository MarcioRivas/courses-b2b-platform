/**
 * Applies the screen's URL state (vista, q) to the course list. Pure;
 * the data is small (one student's enrollments + their org's free courses), so
 * filtering runs in memory on every keystroke without a round trip.
 */
import type { CourseListParams } from "../schemas/course-list-params-schema"
import { orderForAll, orderForMine, type StudentCourseItem } from "./student-course-list"

/** Lowercase, without accents: "Introducción" matches "introduccion". */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

export function filterCourseList(items: StudentCourseItem[], params: CourseListParams): StudentCourseItem[] {
  const ordered =
    params.vista === "disponibles"
      ? items.filter((item) => item.state === "AVAILABLE")
      : params.vista === "mis-cursos"
        ? orderForMine(items)
        : orderForAll(items)

  const query = normalizeSearchText(params.q ?? "")
  if (!query) return ordered
  return ordered.filter((item) => normalizeSearchText(item.title).includes(query))
}
