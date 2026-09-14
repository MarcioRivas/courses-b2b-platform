// Shared helpers for k6-assessment.js and k6-postgrest-baseline.js — kept in
// one place so both scripts drive the exact same VU profile (D30, phase-07
// step 8) and only differ in which endpoint receives the answer saves.
import { SharedArray } from "k6/data"
import { check, sleep } from "k6"
import http from "k6/http"

export const SUPABASE_URL = __ENV.SUPABASE_URL || "http://host.docker.internal:54321"
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY
export const ABANDON_RATIO = Number(__ENV.ABANDON_RATIO || 0)
export const ITERATIONS = Number(__ENV.ITERATIONS || 20)
export const ANSWERS_PER_ITERATION = 5
// Real cadence is ~8s between saves and ~30s between heartbeats (phase file);
// SAVE_INTERVAL_S lets a smoke run compress both proportionally.
export const SAVE_INTERVAL_S = Number(__ENV.SAVE_INTERVAL_S || 8)
export const HEARTBEAT_EVERY_N_SAVES = Math.max(1, Math.round(30 / SAVE_INTERVAL_S))

export const sessions = new SharedArray("sessions", function () {
  return JSON.parse(open("./.sessions.json")).students
})

/** One VU = one pre-minted student; VUs beyond the roster wrap around. */
export function studentForVu() {
  return sessions[(__VU - 1) % sessions.length]
}

/** k6 has no crypto.randomUUID — a client-generated session id only needs to
 * be unique per VU journey, not cryptographically random (matches the
 * randomUUID() session ids the browser generates in `tests/integration`). */
export function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function postgrestHeaders(accessToken) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  }
}

export function cookieHeaders(student) {
  return { "Content-Type": "application/json", Cookie: student.cookieHeader }
}

export function startAttempt(student) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/start_attempt`,
    JSON.stringify({ p_enrollment: student.enrollmentId, p_assessment: student.assessmentId }),
    { headers: postgrestHeaders(student.accessToken), tags: { endpoint: "start_attempt" } }
  )
  check(res, { "start_attempt 2xx": (r) => r.status >= 200 && r.status < 300 })
  if (res.status < 200 || res.status >= 300) return null
  return JSON.parse(res.body)
}

/** Attempt-question ids come from the snapshot `start_attempt` just created —
 * they don't exist until then, so they can't be pre-minted. */
export function fetchAttemptQuestions(student, attemptId) {
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/assessment_attempt_questions?attempt_id=eq.${attemptId}&select=id,options`,
    { headers: postgrestHeaders(student.accessToken), tags: { endpoint: "fetch_questions" } }
  )
  check(res, { "fetch questions 200": (r) => r.status === 200 })
  if (res.status !== 200) return []
  return JSON.parse(res.body)
}

let seqCounter = 0

/** Picks N questions round-robin and answers each with its first option —
 * correctness is irrelevant to a throughput test. */
export function buildAnswers(questions, count) {
  const answers = []
  for (let i = 0; i < count && questions.length > 0; i++) {
    const q = questions[(i + seqCounter) % questions.length]
    answers.push({
      attempt_question_id: q.id,
      selected_option_id: (q.options && q.options[0] && q.options[0].id) || null,
      client_seq: ++seqCounter,
    })
  }
  return answers
}

export function submitAttemptPostgrest(student, attemptId, sessionId) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/submit_attempt`,
    JSON.stringify({ p_attempt: attemptId, p_session: sessionId, p_answers: [] }),
    { headers: postgrestHeaders(student.accessToken), tags: { endpoint: "submit_attempt" } }
  )
  check(res, { "submit_attempt 2xx": (r) => r.status >= 200 && r.status < 300 })
  return res
}

export function heartbeatPostgrest(student, attemptId, sessionId) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/heartbeat`,
    JSON.stringify({ p_attempt: attemptId, p_session: sessionId }),
    { headers: postgrestHeaders(student.accessToken), tags: { endpoint: "heartbeat" } }
  )
  check(res, { "heartbeat 2xx": (r) => r.status >= 200 && r.status < 300 })
  return res
}

export function saveAnswersPostgrest(student, attemptId, sessionId, answers) {
  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/save_answers_batch`,
    JSON.stringify({ p_attempt: attemptId, p_session: sessionId, p_answers: answers }),
    { headers: postgrestHeaders(student.accessToken), tags: { endpoint: "save_answers_batch" } }
  )
  check(res, { "save_answers_batch 2xx": (r) => r.status >= 200 && r.status < 300 })
  return res
}

export function jitterSleep(baseSeconds) {
  sleep(baseSeconds * (0.8 + Math.random() * 0.4))
}
