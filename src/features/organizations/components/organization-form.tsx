"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { orgMessages } from "@/lib/messages/admin-organizations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { createOrganization } from "../actions/create-organization"
import { createOrganizationSchema, type CreateOrganizationInput } from "../schemas/organization-schemas"
import { OrganizationCreatedPanel } from "./organization-created-panel"

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
}

/** Platform-only create form: name + auto-kebab (editable) slug, then the one-time ADMIN link. */
export function OrganizationForm() {
  const [isPending, startTransition] = useTransition()
  const [created, setCreated] = useState<{ organizationId: string; linkToken: string } | null>(null)
  const [slugTouched, setSlugTouched] = useState(false)

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  })

  function handleNameChange(value: string) {
    form.setValue("name", value)
    if (!slugTouched) {
      form.setValue("slug", slugify(value))
    }
  }

  function onSubmit(values: CreateOrganizationInput) {
    startTransition(async () => {
      const result = await createOrganization(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setCreated(result.data)
    })
  }

  if (created) {
    return <OrganizationCreatedPanel organizationId={created.organizationId} linkToken={created.linkToken} />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{orgMessages.create.nameLabel}</FormLabel>
              <FormControl>
                <Input {...field} onChange={(e) => handleNameChange(e.target.value)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{orgMessages.create.slugLabel}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true)
                    field.onChange(e.target.value)
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{orgMessages.create.slugHint}</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? messages.common.loading : orgMessages.create.submit}
        </Button>
      </form>
    </Form>
  )
}
