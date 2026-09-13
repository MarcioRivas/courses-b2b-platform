import { makeUser, type TestUser } from "./make-user"

type MemberRole = "ADMIN" | "PROFESSOR" | "STUDENT"

/**
 * Factory for the `member(label, org, role)` shorthand shared by RLS/RPC
 * integration tests. Pushes every created user id onto the caller's own
 * `cleanup` array so `afterAll` can tear them down.
 */
export function createMemberFactory(cleanup: string[]) {
  return async function member(label: string, org: string, role: MemberRole): Promise<TestUser> {
    const user = await makeUser(label, { organizationId: org, role })
    cleanup.push(user.id)
    return user
  }
}
