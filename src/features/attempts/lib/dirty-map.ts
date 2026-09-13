/**
 * Pure dirty-answer batching (D4/D16/D30): a `Map<attemptQuestionId, DirtyAnswer>`
 * with a per-question monotonic `client_seq`. No timers, no storage, no
 * network — the hook wraps this, the tests exercise it directly.
 */
export interface DirtyAnswer {
  attemptQuestionId: string
  selectedOptionId?: string | null
  textAnswer?: string | null
  clientSeq: number
}

export type DirtyMap = Map<string, DirtyAnswer>

export interface AcceptedEntry {
  attempt_question_id: string
  client_seq: number
}

export const RETRY_DELAYS_MS = [500, 1000, 2000] as const
export const AUTOSAVE_DEBOUNCE_MS = 1500
export const AUTOSAVE_FORCE_FLUSH_MS = 10000
/**
 * Must equal `save_answers_batch`'s `length(i.text_answer) <= 20000` check
 * (`20260911210400_…:101`) — the RPC silently *filters* an oversized row out
 * of `validated` (see `reconcileAccepted` below) instead of raising, so this
 * cap is the only thing that keeps such a row from ever being reachable from
 * the UI. Imported by `attempt-schemas.ts` so client and RPC cannot drift.
 */
export const ANSWER_TEXT_MAX = 20000

/**
 * Records one edit, advancing that question's `client_seq` by 1 from whatever
 * counter it last used (seeded from the server snapshot so a resumed tab never
 * goes backwards — D4). Takes `max(counter, existing dirty seq)` so a counter
 * that fell behind the dirty map (e.g. right after a reload reseed) can never
 * emit a seq the map itself already used. Unspecified fields keep the
 * previous dirty value so a partial patch (e.g. only `textAnswer`) never
 * erases the other field.
 */
export function bumpDirty(
  map: DirtyMap,
  seqCounters: ReadonlyMap<string, number>,
  attemptQuestionId: string,
  patch: { selectedOptionId?: string | null; textAnswer?: string | null }
): { map: DirtyMap; seqCounters: Map<string, number> } {
  const existing = map.get(attemptQuestionId)
  const nextSeq = Math.max(seqCounters.get(attemptQuestionId) ?? 0, existing?.clientSeq ?? 0) + 1
  const nextCounters = new Map(seqCounters)
  nextCounters.set(attemptQuestionId, nextSeq)

  const nextMap = new Map(map)
  nextMap.set(attemptQuestionId, {
    attemptQuestionId,
    selectedOptionId: "selectedOptionId" in patch ? patch.selectedOptionId : existing?.selectedOptionId,
    textAnswer: "textAnswer" in patch ? patch.textAnswer : existing?.textAnswer,
    clientSeq: nextSeq,
  })

  return { map: nextMap, seqCounters: nextCounters }
}

/** The subset of `DirtyAnswer` needed to know what seq a batch was sent with. */
export interface SentAnswer {
  attemptQuestionId: string
  clientSeq: number
}

/**
 * Removes the entries the server has already durably accepted for the batch
 * that was just sent. `sent` is the snapshot of `clientSeq`s that went out
 * with this request; `accepted` is whatever the RPC echoed back.
 *
 * A question can be missing from `accepted` for two reasons: the server
 * already held a seq ≥ what we sent (H1 — this must still clear, or a
 * keepalive/force-flush resends the same no-op write forever), or the
 * request never reached the server at all (H1 does not apply — nothing to
 * clear). We cannot tell those apart from the response alone.
 *
 * `save_answers_batch`'s `validated` CTE (`20260911210400:…`) does NOT fail
 * the whole request on a per-row problem (unknown question, option not in
 * this attempt's own snapshot, text over `ANSWER_TEXT_MAX`) — it silently
 * *filters* that row out of `validated`, so it is also missing from
 * `accepted` despite never having a stale-seq conflict. Clearing it anyway is
 * still safe only because those rows are unreachable from the normal UI: the
 * snapshot-derived option ids and the `answerSchema.text_answer.max(ANSWER_TEXT_MAX)`
 * + textarea `maxLength` keep the client from ever constructing one. Once we
 * know the request round-tripped successfully (`ok: true`), any sent seq
 * missing from `accepted` is safe to clear.
 *
 * A newer local edit made while the request was in flight (current
 * `clientSeq` higher than what was sent) must survive either way — that is
 * what makes a stale reconciliation safe (D4).
 */
export function reconcileAccepted(
  map: DirtyMap,
  sent: readonly SentAnswer[],
  accepted: readonly AcceptedEntry[]
): DirtyMap {
  if (sent.length === 0) {
    return map
  }

  const acceptedSeqs = new Map(accepted.map((entry) => [entry.attempt_question_id, entry.client_seq]))
  const next = new Map(map)
  for (const { attemptQuestionId, clientSeq: sentSeq } of sent) {
    const current = next.get(attemptQuestionId)
    if (!current) {
      continue
    }
    const clearAtOrBelow = acceptedSeqs.get(attemptQuestionId) ?? sentSeq
    if (current.clientSeq <= clearAtOrBelow) {
      next.delete(attemptQuestionId)
    }
  }
  return next
}

/**
 * Defensive floor: after a round-trip, no per-question counter should sit
 * below the seq the server just confirmed (it never legitimately can — a
 * counter only advances when the dirty map does — but this keeps the two in
 * lockstep even if seeding/reload logic changes later).
 */
export function raiseSeqCounters(seqCounters: ReadonlyMap<string, number>, accepted: readonly AcceptedEntry[]): Map<string, number> {
  const next = new Map(seqCounters)
  for (const entry of accepted) {
    if (entry.client_seq > (next.get(entry.attempt_question_id) ?? 0)) {
      next.set(entry.attempt_question_id, entry.client_seq)
    }
  }
  return next
}

/**
 * Reload/resume seeding (H1): a mirror seq can be *higher* than what the RSC
 * snapshot last saw (e.g. a keepalive flush that never got reconciled before
 * the tab reloaded), so the counter must start from `max(server, mirror)` —
 * seeding from the server alone lets a subsequent edit reuse a seq the mirror
 * already used, which `save_answers_batch` then silently discards. A mirror
 * entry only feeds `values`/`dirty` when it is strictly newer than the
 * server's own copy of that answer.
 */
export function seedFromMirror(
  serverQuestions: readonly { attemptQuestionId: string; clientSeq: number; selectedOptionId: string | null; textAnswer: string | null }[],
  mirror: readonly DirtyAnswer[]
): {
  seqCounters: Map<string, number>
  dirty: DirtyMap
  values: Map<string, { selectedOptionId: string | null; textAnswer: string | null }>
} {
  const mirrorById = new Map(mirror.map((answer) => [answer.attemptQuestionId, answer]))
  const seqCounters = new Map<string, number>()
  const dirty: DirtyMap = new Map()
  const values = new Map<string, { selectedOptionId: string | null; textAnswer: string | null }>()

  for (const question of serverQuestions) {
    const mirrorEntry = mirrorById.get(question.attemptQuestionId)
    const mirrorSeq = mirrorEntry?.clientSeq ?? 0
    seqCounters.set(question.attemptQuestionId, Math.max(question.clientSeq, mirrorSeq))

    if (mirrorEntry && mirrorSeq > question.clientSeq) {
      dirty.set(question.attemptQuestionId, mirrorEntry)
      values.set(question.attemptQuestionId, {
        selectedOptionId: mirrorEntry.selectedOptionId ?? null,
        textAnswer: mirrorEntry.textAnswer ?? null,
      })
    } else {
      values.set(question.attemptQuestionId, {
        selectedOptionId: question.selectedOptionId,
        textAnswer: question.textAnswer,
      })
    }
  }

  return { seqCounters, dirty, values }
}

/** Shape expected by `save_answers_batch` / `submit_attempt` (Zod-validated server-side too). */
export function toAnswerPayload(map: DirtyMap): Array<{
  attempt_question_id: string
  selected_option_id: string | null
  text_answer: string | null
  client_seq: number
}> {
  return Array.from(map.values()).map((answer) => ({
    attempt_question_id: answer.attemptQuestionId,
    selected_option_id: answer.selectedOptionId ?? null,
    text_answer: answer.textAnswer ?? null,
    client_seq: answer.clientSeq,
  }))
}
