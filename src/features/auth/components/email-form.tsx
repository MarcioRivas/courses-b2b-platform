"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { emailSchema } from "@/lib/validation/zod-helpers"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { sendOtp } from "../actions/send-otp"
import type { AuthMode } from "../schemas/auth-schemas"

const emailFormSchema = z.object({ email: emailSchema })
type EmailFormValues = z.infer<typeof emailFormSchema>

interface EmailFormProps {
  mode: AuthMode
  token?: string
}

export function EmailForm({ mode, token }: EmailFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: "" },
  })

  function onSubmit(values: EmailFormValues) {
    startTransition(async () => {
      const result = await sendOtp({ email: values.email, mode, token })
      if (!result.ok) {
        toast.error(result.message)
        return
      }

      const params = new URLSearchParams({ email: values.email, mode })
      if (token) params.set("token", token)
      router.push(`/login/verify?${params.toString()}`)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.login.emailLabel}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder={messages.login.emailPlaceholder}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? messages.common.loading : messages.login.submit}
        </Button>
      </form>
    </Form>
  )
}
