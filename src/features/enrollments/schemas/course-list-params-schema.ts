import { z } from "zod"

export const COURSE_VIEWS = ["todos", "mis-cursos", "disponibles"] as const

export type CourseView = (typeof COURSE_VIEWS)[number]

/** Search params of /learn. Invalid values are dropped (fall back to defaults), never an error page. */
const rawParamsSchema = z.object({
  vista: z.enum(COURSE_VIEWS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
})

export interface CourseListParams {
  vista: CourseView
  q?: string
}

type RawParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** Without enrollments the screen opens on "Disponibles" ("Elegí tu primer curso"). */
export function defaultCourseView(hasEnrollments: boolean): CourseView {
  return hasEnrollments ? "todos" : "disponibles"
}

export function resolveCourseListParams(raw: RawParams, hasEnrollments: boolean): CourseListParams {
  const parsed = rawParamsSchema.parse({ vista: first(raw.vista), q: first(raw.q) })
  const vista = parsed.vista ?? defaultCourseView(hasEnrollments)

  return { vista, q: parsed.q || undefined }
}

/** Query string for the URL, omitting defaults so the plain /learn link stays clean. */
export function serializeCourseListParams(params: CourseListParams, hasEnrollments: boolean): string {
  const search = new URLSearchParams()
  if (params.vista !== defaultCourseView(hasEnrollments)) search.set("vista", params.vista)
  if (params.q) search.set("q", params.q)
  const query = search.toString()
  return query ? `?${query}` : ""
}
