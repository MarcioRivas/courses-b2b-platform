"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { z } from "zod"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { completeRegistration } from "../actions/complete-registration"
import { completeRegistrationSchema } from "../schemas/auth-schemas"

type ProfileFormValues = z.infer<typeof completeRegistrationSchema>

interface ProfileFormProps {
  token: string
}

export function ProfileForm({ token }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(completeRegistrationSchema),
    defaultValues: { token, firstName: "", lastName: "", phone: "", dni: "" },
  })

  function onSubmit(values: ProfileFormValues) {
    startTransition(async () => {
      // On success completeRegistration redirects server-side.
      const result = await completeRegistration(values)
      if (!result.ok) {
        toast.error(result.message)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.firstNameLabel}</FormLabel>
              <FormControl>
                <Input autoComplete="given-name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.lastNameLabel}</FormLabel>
              <FormControl>
                <Input autoComplete="family-name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.phoneLabel}</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dni"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{messages.register.dniLabel}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? messages.common.loading : messages.register.submitProfile}
        </Button>
      </form>
    </Form>
  )
}
