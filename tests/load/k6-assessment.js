// Phase 7 step 8 — the acceptance load test (D30/F15).
//
// Drives the real student entrypoint: `/api/attempts/[id]/{answers,heartbeat}`
// Route Handlers on a `next start` production build. `start_attempt` and
// `submit_attempt` have no Route Handler (only Server Actions, which k6
// cannot call), so those two hit PostgREST directly with the same bearer
// token a Server Action's cookie session resolves to.
import http from "k6/http"
import { sleep } from "k6"
import {
  ABANDON_RATIO,
  ANSWERS_PER_ITERATION,
  HEARTBEAT_EVERY_N_SAVES,
  ITERATIONS,
  SAVE_INTERVAL_S,
  buildAnswers,
  cookieHeaders,
  fetchAttemptQuestions,
  jitterSleep,
  startAttempt,
  studentForVu,
  submitAttemptPostgrest,
  uuidv4,
} from "./k6-lib.js"

const BASE_URL = __ENV.BASE_URL || "http://host.docker.internal:3000"
// Time budget for one VU's full journey: 20 saves * ~8s + a few heartbeats +
// network overhead. The hold stage must outlast the slowest VU that started
// at the very end of the 120s ramp.
const JOURNEY_BUDGET_S = ITERATIONS * SAVE_INTERVAL_S + 60

export const options = {
  scenarios: {
    assessment_load: {
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
    "http_req_duration{endpoint:answers}": ["p(95)<500"],
  },
};

function studentJourney() {
  // ramping-vus keeps calling this function for as long as a VU is active;
  // each pre-minted student has max_attempts=1, so a second journey for the
  // same VU would just fail start_attempt. Run once per VU.
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
    http.post(
      `${BASE_URL}/api/attempts/${attemptId}/answers`,
      JSON.stringify({ sessionId, answers }),
      { headers: cookieHeaders(student), tags: { endpoint: "answers" } }
    )

    if (i % HEARTBEAT_EVERY_N_SAVES === 0) {
      http.post(
        `${BASE_URL}/api/attempts/${attemptId}/heartbeat`,
        JSON.stringify({ sessionId }),
        { headers: cookieHeaders(student), tags: { endpoint: "heartbeat" } }
      )
    }

    jitterSleep(SAVE_INTERVAL_S)
  }

  const abandons = Math.random() < ABANDON_RATIO
  if (!abandons) {
    submitAttemptPostgrest(student, attemptId, sessionId)
  }
}

export default studentJourney
