// Phase 7 step 8 — DB-only baseline (D30). Same VU profile as
// k6-assessment.js, but every call (including answers) hits PostgREST's
// `rpc/save_answers_batch` directly with a bearer token — no Next.js, no
// cookies, no Route Handler validation. The delta between this run's numbers
// and k6-assessment.js's is the platform's own cost on top of the DB.
import { sleep } from "k6"
import {
  ABANDON_RATIO,
  ANSWERS_PER_ITERATION,
  HEARTBEAT_EVERY_N_SAVES,
  ITERATIONS,
  SAVE_INTERVAL_S,
  buildAnswers,
  fetchAttemptQuestions,
  heartbeatPostgrest,
  jitterSleep,
  saveAnswersPostgrest,
  startAttempt,
  studentForVu,
  submitAttemptPostgrest,
  uuidv4,
} from "./k6-lib.js"

const JOURNEY_BUDGET_S = ITERATIONS * SAVE_INTERVAL_S + 60

export const options = {
  scenarios: {
    postgrest_baseline: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "120s", target: Number(__ENV.TARGET_VUS || 500) },
        { duration: `${JOURNEY_BUDGET_S}s`, target: Number(__ENV.TARGET_VUS || 500) },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:save_answers_batch}": ["p(95)<500"],
  },
};

function studentJourney() {
  // Same one-journey-per-VU guard as k6-assessment.js — see there for why.
  if (__ITER > 0) {
    sleep(1)
    return
  }

  const student = studentForVu()
  const attemptId = startAttempt(student)
  if (!attemptId) return

  const sessionId = uuidv4()
  const questions = fetchAttemptQuestions(student, attemptId)

  for (let i = 1; i <= ITERATIONS; i++) {
    const answers = buildAnswers(questions, ANSWERS_PER_ITERATION)
    saveAnswersPostgrest(student, attemptId, sessionId, answers)

    if (i % HEARTBEAT_EVERY_N_SAVES === 0) {
      heartbeatPostgrest(student, attemptId, sessionId)
    }

    jitterSleep(SAVE_INTERVAL_S)
  }

  const abandons = Math.random() < ABANDON_RATIO
  if (!abandons) {
    submitAttemptPostgrest(student, attemptId, sessionId)
  }
}

export default studentJourney
