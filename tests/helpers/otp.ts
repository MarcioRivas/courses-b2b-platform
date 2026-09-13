import { supabaseAdmin } from "./supabase-admin"

/**
 * Fetches a real 6-digit OTP for `email` via the admin API — no mailbox
 * scraping, no link-following (docs/code-standards.md "Testing").
 */
export async function generateOtp(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  const otp = data?.properties?.email_otp

  if (error || !otp) {
    throw new Error(`Failed to generate OTP for ${email}: ${error?.message ?? "no email_otp"}`)
  }

  return otp
}
