import { deleteUser, makeUser, type TestUser } from "./make-user"

export const ORG_A = "11111111-1111-1111-1111-111111111111"
export const ORG_B = "22222222-2222-2222-2222-222222222222"
export const TOKEN_A = "demo-link-org-a"

/** Tracks throwaway registrants created during a test file so afterAll can clean them up. */
export function createRegistrantFactory() {
  const createdIds: string[] = []
  return {
    async create(label = "registrant"): Promise<TestUser> {
      const user = await makeUser(label, {})
      createdIds.push(user.id)
      return user
    },
    async cleanup(): Promise<void> {
      await Promise.all(createdIds.map((id) => deleteUser(id)))
    },
  }
}
