import type { DirtyAnswer } from "./dirty-map"

/**
 * `sessionStorage` mirrors (D16): dies with the tab, like the attempt session
 * itself. Never `localStorage` — a stale answer surviving into a new
 * unrelated tab would be worse than losing it.
 */
const answersKey = (attemptId: string) => `attempt:${attemptId}`
const sessionKey = (attemptId: string) => `attempt-session:${attemptId}`

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
}

export function loadStoredAnswers(attemptId: string): DirtyAnswer[] {
  if (!hasSessionStorage()) {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(answersKey(attemptId))
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DirtyAnswer[]) : []
  } catch {
    return []
  }
}

export function saveStoredAnswers(attemptId: string, answers: DirtyAnswer[]): void {
  if (!hasSessionStorage()) {
    return
  }

  try {
    window.sessionStorage.setItem(answersKey(attemptId), JSON.stringify(answers))
  } catch {
    // Storage full/unavailable: the in-memory dirty map remains authoritative
    // for this tab; only the crash-survival mirror is lost.
  }
}

export function clearStoredAnswers(attemptId: string): void {
  if (!hasSessionStorage()) {
    return
  }

  try {
    window.sessionStorage.removeItem(answersKey(attemptId))
  } catch {
    // Nothing to do — the key will simply outlive submission if this throws.
  }
}

/**
 * One id per tab, created once and read back on reload (D3): the session
 * survives a refresh but a genuinely new tab gets a new id, which is exactly
 * what makes the second-tab lock detectable.
 */
export function getOrCreateSessionId(attemptId: string): string {
  if (!hasSessionStorage()) {
    return crypto.randomUUID()
  }

  const key = sessionKey(attemptId)
  const existing = window.sessionStorage.getItem(key)
  if (existing) {
    return existing
  }

  const id = crypto.randomUUID()
  window.sessionStorage.setItem(key, id)
  return id
}
