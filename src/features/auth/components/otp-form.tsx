"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { otpSchema } from "@/lib/validation/zod-helpers"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { verifyOtp } from "../actions/verify-otp"
import { sendOtp } from "../actions/send-otp"
import type { AuthMode } from "../schemas/auth-schemas"

const otpFormSchema = z.object({ otp: otpSchema })
type OtpFormValues = z.infer<typeof otpFormSchema>

interface OtpFormProps {
  email: string
  mode: AuthMode
  token?: string
}

export function OtpForm({ email, mode, token }: OtpFormProps) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { otp: "" },
  })

  function onSubmit(values: OtpFormValues) {
    startTransition(async () => {
      // On success verifyOtp redirects server-side; only the error path returns here.
      const result = await verifyOtp({ email, otp: values.otp, mode, token })
      if (!result.ok) {
        toast.error(result.message)
      }
    })
  }

  function handleResend() {
    startTransition(async () => {
      const result = await sendOtp({ email, mode, token })
      if (result.ok) {
        toast.success(messages.login.otpResent)
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {messages.login.otpSentDescriptionPrefix} {email}.
        </p>
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.login.otpLabel}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? messages.common.loading : messages.login.verify}
        </Button>
        <Button type="button" variant="ghost" onClick={handleResend} disabled={isPending}>
          {messages.login.resend}
        </Button>
      </form>
    </Form>
  )
}
