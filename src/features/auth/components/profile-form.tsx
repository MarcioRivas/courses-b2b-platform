"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { z } from "zod"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { completeRegistration } from "../actions/complete-registration"
import { ProfileFields } from "./profile-fields"
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <ProfileFields />
        <Button type="submit" size="lg" className="h-11 rounded-xl" disabled={isPending}>
          {isPending ? messages.common.loading : messages.register.submitProfile}
        </Button>
      </form>
    </Form>
  )
}
