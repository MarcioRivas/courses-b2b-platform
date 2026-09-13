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

export const completeRegistrationSchema = z.object({
  token: registrationTokenSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  dni: dniSchema,
})
export type CompleteRegistrationInput = z.infer<typeof completeRegistrationSchema>
