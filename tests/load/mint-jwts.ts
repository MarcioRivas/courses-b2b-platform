/**
 * Phase 7 load-test fixture minter (D30/F15).
 *
 * Creates one org-A course + PUBLISHED EXAM (40 MC questions, N-minute window,
 * max_attempts 1), N students enrolled in it, and writes `.sessions.json` with
 * a cookie-authenticated session per student for k6 to drive against the real
 * Next.js Route Handlers. `--cleanup` reverses it.
 *
 * Reuses the vitest fixture helpers (`tests/helpers/*`) via dynamic import so
 * `dotenv` can populate `process.env` first — those modules read
 * `NEXT_PUBLIC_SUPABASE_URL` etc. at import time, before a static `import`
 * higher in this file would get a chance to run.
 */
import path from "node:path"
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs"
import { config } from "dotenv"

config({ path: path.resolve(process.cwd(), ".env.local") })

const ORG_A = "11111111-1111-1111-1111-111111111111"
const SESSIONS_PATH = path.resolve(__dirname, ".sessions.json")

interface Args {
  cleanup: boolean
  count: number
  durationMinutes: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string, fallback: number) => {
    const hit = argv.find((a) => a.startsWith(`--${flag}=`))
    return hit ? Number(hit.split("=")[1]) : fallback
  }
  return {
    cleanup: argv.includes("--cleanup"),
    count: get("count", 500),
    durationMinutes: get("duration-minutes", 60),
  }
}

/** Runs `fn` over `items` with bounded concurrency — 500 sequential admin API
 * round trips would take too long, 500 simultaneous ones would hammer local
 * GoTrue/Postgres. */
async function runBatched<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

interface SessionEntry {
  userId: string
  email: string
  accessToken: string
  cookieHeader: string
  enrollmentId: string
  assessmentId: string
}

interface SessionsFile {
  organizationId: string
  courseId: string
  bankId: string
  assessmentId: string
  createdAt: string
  students: SessionEntry[]
}

async function doCleanup() {
  if (!existsSync(SESSIONS_PATH)) {
    console.log("No .sessions.json found — nothing to clean up.")
    return
  }
  const file: SessionsFile = JSON.parse(readFileSync(SESSIONS_PATH, "utf-8"))
  const { cleanupFixtures } = await import("../helpers/course-fixtures")
  await cleanupFixtures({
    users: file.students.map((s) => s.userId),
    courseIds: [file.courseId],
    bankIds: [file.bankId],
  })
  unlinkSync(SESSIONS_PATH)
  console.log(`Cleaned up ${file.students.length} students, course ${file.courseId}, bank ${file.bankId}.`)
}

async function doMint(args: Args) {
  const { makeCourseFixture, makeAssessmentFixture, enrollStudent } = await import("../helpers/course-fixtures")
  const { makeUser } = await import("../helpers/make-user")

  console.log(`Minting ${args.count} students + a ${args.durationMinutes}-min EXAM in org ${ORG_A}...`)

  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Carga k6 — ${new Date().toISOString()}`,
    modules: [],
  })

  // EXAM requires a full availability window (B3, assessments_exam_window_check).
  // The window itself stays generous (24h) — `durationSeconds` is the per-attempt
  // timer that the abandonment run shortens via --duration-minutes.
  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: "Carga k6 — examen",
    kind: "EXAM",
    multipleChoice: 40,
    openEnded: 0,
    durationSeconds: args.durationMinutes * 60,
    availableFrom: new Date(Date.now() - 60_000).toISOString(),
    availableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    maxAttempts: 1,
    status: "PUBLISHED",
  })

  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
  const cookieName = `sb-${projectRef}-auth-token`

  const indices = Array.from({ length: args.count }, (_, i) => i)
  const students = await runBatched(indices, 20, async (i): Promise<SessionEntry> => {
    const student = await makeUser(`load-${i}`, { organizationId: ORG_A, role: "STUDENT", status: "ACTIVE" })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const {
      data: { session },
    } = await student.client.auth.getSession()
    if (!session) throw new Error(`no session for load-${i}`)

    const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64")
    return {
      userId: student.id,
      email: student.email,
      accessToken: session.access_token,
      cookieHeader: `${cookieName}=${cookieValue}`,
      enrollmentId,
      assessmentId: fixture.assessmentId,
    }
  })

  const file: SessionsFile = {
    organizationId: ORG_A,
    courseId: course.courseId,
    bankId: fixture.bankId,
    assessmentId: fixture.assessmentId,
    createdAt: new Date().toISOString(),
    students,
  }
  writeFileSync(SESSIONS_PATH, JSON.stringify(file, null, 2))
  console.log(`Wrote ${students.length} sessions to ${SESSIONS_PATH}`)
  console.log(`courseId=${course.courseId} bankId=${fixture.bankId} assessmentId=${fixture.assessmentId}`)
}

async function main() {
  const args = parseArgs()
  if (args.cleanup) {
    await doCleanup()
  } else {
    await doMint(args)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
