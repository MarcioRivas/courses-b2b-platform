import { supabaseAdmin } from "./supabase-admin"

const TEST_EMAIL_PREFIX = "test+"

/**
 * Deletes any leftover throwaway auth.users rows (email starts with "test+").
 * Cascades remove profiles/profile_private/memberships. Safe to run before/after suites.
 */
export async function deleteAllTestUsers(): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error

  const testUsers = data.users.filter((user) => user.email?.startsWith(TEST_EMAIL_PREFIX))
  for (const user of testUsers) {
    await supabaseAdmin.auth.admin.deleteUser(user.id)
  }
}
