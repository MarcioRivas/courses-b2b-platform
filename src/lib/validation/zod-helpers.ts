import { z } from "zod"

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Ingresá tu correo electrónico.")
  .email("Ingresá un correo válido.")

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El código debe tener 6 dígitos.")

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Ingresá al menos 2 caracteres.")
  .max(80, "Máximo 80 caracteres.")

export const phoneSchema = z
  .string()
  .trim()
  .min(6, "Ingresá un teléfono válido.")
  .max(20, "Máximo 20 caracteres.")
  .regex(/^[0-9 ()+.-]+$/, "Usá solo números, espacios y los símbolos + - ( ) .")

/** Registration link token: matches the base64url charset generated in SQL (W3). */
export const registrationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Link de registro inválido.")

export const dniSchema = z
  .string()
  .trim()
  .min(6, "Ingresá un DNI válido.")
  .max(15, "Máximo 15 caracteres.")
