import { execFileSync } from "node:child_process"

let cachedContainer: string | null = null

function findDbContainerName(): string {
  const output = execFileSync(
    "docker",
    ["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"],
    { encoding: "utf-8" }
  ).trim()
  const name = output.split("\n")[0]
  if (!name) throw new Error("No running supabase_db container found (is `supabase start` running?)")
  return name
}

/** Runs raw SQL inside the local Supabase Postgres container and returns trimmed stdout. */
export function psql(sql: string): string {
  cachedContainer ??= findDbContainerName()
  return execFileSync(
    "docker",
    ["exec", "-i", cachedContainer, "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
    { encoding: "utf-8" }
  ).trim()
}

/** Convenience for boolean-returning SQL (psql prints 't'/'f'). */
export function psqlBool(sql: string): boolean {
  return psql(sql) === "t"
}
