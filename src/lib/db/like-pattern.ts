/**
 * Escapes Postgres LIKE/ILIKE wildcards so a literal `%` or `_` typed into a
 * search box matches itself instead of acting as a wildcard.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[%_]/g, "\\$&")}%`
}
