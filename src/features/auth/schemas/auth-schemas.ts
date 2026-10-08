import { z } from "zod"
import {
  dniSchema,
  emailSchema,
  nameSchema,
  otpSchema,
  phoneSchema,
  registrationTokenSchema,
} from "@/lib/validation/zod-helpers"

export const authModeSchema = z.enum(["login", "register"])
export type AuthMode = z.infer<typeof authModeSchema>

export const sendOtpSchema = z.object({
  email: emailSchema,
  mode: authModeSchema,
  token: registrationTokenSchema.optional(),
})
export type SendOtpInput = z.infer<typeof sendOtpSchema>

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  mode: authModeSchema,
  token: registrationTokenSchema.optional(),
})
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

/** Personal-data fields shared by registration and the admin member editor. */
export const profileFieldsSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  dni: dniSchema,
})
export type ProfileFieldsInput = z.infer<typeof profileFieldsSchema>

export const completeRegistrationSchema = profileFieldsSchema.extend({
  token: registrationTokenSchema,
})
export type CompleteRegistrationInput = z.infer<typeof completeRegistrationSchema>
