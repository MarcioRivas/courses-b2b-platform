"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { messages } from "@/lib/messages/es"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { createRegistrationLink } from "../actions/create-link"
import { createLinkSchema } from "../schemas/link-schemas"

type FormValues = z.infer<typeof createLinkSchema>

interface LinkFormProps {
  organizationId: string
  /** ADMIN-role links are reserved for platform admins (D23) — the RPC also enforces this. */
  allowAdminRole: boolean
}

function defaultExpiry(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}

export function LinkForm({ organizationId, allowAdminRole }: LinkFormProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    resolver: zodResolver(createLinkSchema),
    defaultValues: { organizationId, label: "", role: "STUDENT", expiresAt: defaultExpiry() },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createRegistrationLink(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(adminLinksMessages.form.success)
      form.reset({ organizationId, label: "", role: "STUDENT", expiresAt: defaultExpiry() })
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">{adminLinksMessages.createTrigger}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adminLinksMessages.createTrigger}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{adminLinksMessages.form.labelField}</FormLabel>
                  <FormControl>
                    <Input placeholder={adminLinksMessages.form.labelPlaceholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{adminLinksMessages.form.roleField}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STUDENT">{messages.roles.STUDENT}</SelectItem>
                      <SelectItem value="PROFESSOR">{messages.roles.PROFESSOR}</SelectItem>
                      {allowAdminRole && <SelectItem value="ADMIN">{messages.roles.ADMIN}</SelectItem>}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxUses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{adminLinksMessages.form.maxUsesField}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>{adminLinksMessages.form.maxUsesHint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{adminLinksMessages.form.expiresField}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? messages.common.loading : adminLinksMessages.form.submit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
