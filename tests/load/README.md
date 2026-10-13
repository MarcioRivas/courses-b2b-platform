# Load tests (Phase 7 step 8)

Acceptance run is **local** (D36): `next start` (production build) against the
local Supabase stack. The deployed-preview rerun is a `deploy-checklist.md`
item, done once after hosted provisioning.

## Files

- `mint-jwts.ts` — creates the org-A course + PUBLISHED EXAM (40 MC questions,
  configurable duration, `max_attempts` 1), N students enrolled in it, and
  writes `.sessions.json` (git-ignored) with a cookie-authenticated session
  per student. `--cleanup` reverses everything it created.
- `k6-lib.js` — shared helpers (session loading, PostgREST calls, answer
  building) used by both k6 scripts below.
- `k6-assessment.js` — the acceptance run. Drives the real student entrypoint:
  `POST /api/attempts/[id]/{answers,heartbeat}` on the Next.js app, with
  `start_attempt`/`submit_attempt` against PostgREST directly (no Route
  Handler exists for those — only Server Actions, which k6 cannot call).
- `k6-postgrest-baseline.js` — same VU profile, but answers/heartbeat also go
  straight to PostgREST's `rpc/save_answers_batch` / `rpc/heartbeat`. The delta
  between this run and `k6-assessment.js` is the Next.js/Route-Handler cost on
  top of the database.

## 1. Mint fixtures

```bash
# full run: 500 students, 60-minute exam window
pnpm tsx tests/load/mint-jwts.ts --count=500 --duration-minutes=60

# abandonment run: short exam so the cron sweep/lazy finalize trigger quickly
pnpm tsx tests/load/mint-jwts.ts --count=500 --duration-minutes=3
```

Flags: `--count=N` (default 500), `--duration-minutes=N` (default 60,
this is the EXAM's `duration_seconds` — the availability window itself is
always a generous 24h so the fixture doesn't expire mid-run), `--cleanup`
(deletes the users/course recorded in `.sessions.json`).

## 2. Build + start the app

The acceptance run needs a **production build**, not `next dev`. Use a port
that isn't already occupied (check `lsof -iTCP:3000 -sTCP:LISTEN` first — a
dev server from another session may already own :3000):

```bash
pnpm build
PORT=3001 pnpm start &
until curl -sf http://127.0.0.1:3001 -o /dev/null; do sleep 1; done
```

## 3. Run k6 via Docker

```bash
docker pull grafana/k6   # once

ANON=$(node -e "require('dotenv').config({path:'.env.local', quiet:true}); console.log(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)")
# dotenv's random stdout "tip" banner (not `quiet:true`) will corrupt $ANON —
# if a run fails auth, check $ANON doesn't contain a stray banner line first.

# (a) acceptance run — 500 VUs against the Next.js app
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$PWD/tests/load:/load" \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_ANON_KEY="$ANON" \
  -e TARGET_VUS=500 \
  grafana/k6 run /load/k6-assessment.js

# (b) PostgREST-only baseline (mint a fresh batch first — max_attempts is 1)
pnpm tsx tests/load/mint-jwts.ts --count=500 --duration-minutes=60
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$PWD/tests/load:/load" \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_ANON_KEY="$ANON" \
  -e TARGET_VUS=500 \
  grafana/k6 run /load/k6-postgrest-baseline.js

# (c) abandonment run — SHORT exam + 20% of VUs never submit
pnpm tsx tests/load/mint-jwts.ts --count=500 --duration-minutes=3
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v "$PWD/tests/load:/load" \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_ANON_KEY="$ANON" \
  -e TARGET_VUS=500 -e ABANDON_RATIO=0.2 \
  grafana/k6 run /load/k6-assessment.js
```

Env vars: `BASE_URL` (Next app, only for `k6-assessment.js`), `SUPABASE_URL` /
`SUPABASE_ANON_KEY` (PostgREST, both scripts), `TARGET_VUS` (step down to
250/100 if the laptop can't sustain 500), `ITERATIONS` (default 20),
`SAVE_INTERVAL_S` (default 8 — the ~8s cadence between saves; lower it for a
quick smoke run), `ABANDON_RATIO` (default 0, use 0.2 for run (c)).

If Docker cannot reach `host.docker.internal` on your machine, try
`brew install k6` and run the scripts directly (`k6 run tests/load/k6-assessment.js`)
with `BASE_URL=http://127.0.0.1:3001` — no `--add-host` needed.

After run (c), poll for auto-submission and check the cron/audit trail:

```bash
docker exec supabase_db_ENECourses psql -U postgres -c \
  "select count(*) filter (where status='IN_PROGRESS') as still_running, count(*) from assessment_attempts where assessment_id = '<assessmentId from .sessions.json>';"
docker exec supabase_db_ENECourses psql -U postgres -c \
  "select * from cron.job_run_details where status <> 'succeeded' order by end_time desc limit 20;"
docker exec supabase_db_ENECourses psql -U postgres -c \
  "select * from audit_logs where action = 'attempt.finalize_failed' order by created_at desc limit 20;"
```

## 4. Tear down

```bash
kill %1   # the `pnpm start` background job
pnpm tsx tests/load/mint-jwts.ts --cleanup
```

Results and analysis: `docs/performance-review.md`.
