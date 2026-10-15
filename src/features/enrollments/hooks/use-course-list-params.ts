"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  defaultCourseView,
  resolveCourseListParams,
  serializeCourseListParams,
  type CourseListParams,
} from "../schemas/course-list-params-schema"

/**
 * Filter state of the "Cursos" screen. Read from the real URL when the screen
 * mounts (so the back button after opening a course restores the view, even
 * when Next serves /learn from its cache), kept in React state while filtering
 * client-side, and mirrored back with `history.replaceState`: no server render
 * per keystroke and no pending navigation that could race a link click.
 */
export function useCourseListParams(hasEnrollments: boolean) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [params, setParams] = useState(() =>
    resolveCourseListParams(Object.fromEntries(searchParams.entries()), hasEnrollments)
  )

  useEffect(() => {
    const url = `${pathname}${serializeCourseListParams(params, hasEnrollments)}`
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url)
    }
  }, [params, hasEnrollments, pathname])

  const setView = useCallback((vista: CourseListParams["vista"]) => {
    setParams((current) => ({ vista, q: current.q }))
  }, [])

  const setQuery = useCallback((q: string) => {
    setParams((current) => ({ ...current, q: q.slice(0, 100) || undefined }))
  }, [])

  const clear = useCallback(() => setParams({ vista: defaultCourseView(hasEnrollments) }), [hasEnrollments])

  return { params, setView, setQuery, clear }
}
