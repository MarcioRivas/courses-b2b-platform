/** Helpers for the `searchParams` object Next hands to a Server Component. */

export type SearchParams = Record<string, string | string[] | undefined>

/** Next allows a repeated query key; list screens only ever want the first value. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Rebuilds a list URL, carrying the current filters over and applying
 * `overrides`. An override of `undefined` drops that key — which is how a
 * filter change resets pagination back to page 1.
 */
export function buildListHref(
  basePath: string,
  searchParams: SearchParams,
  overrides: Record<string, string | undefined>
): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams)) {
    if (key in overrides) {
      continue
    }
    const single = firstParam(value)
    if (single) {
      params.set(key, single)
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value) {
      params.set(key, value)
    }
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}
