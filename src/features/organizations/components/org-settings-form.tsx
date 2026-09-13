"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { settingsMessages } from "@/lib/messages/admin-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateOrgSettings } from "../actions/update-org-settings"
import { orgSettingsSchema, type OrgSettingsInput } from "../schemas/organization-schemas"
import { TIMEZONE_OPTIONS } from "../timezones"

interface OrgSettingsFormProps {
  settings: OrgSettingsInput
}

export function OrgSettingsForm({ settings }: OrgSettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<OrgSettingsInput>({
    resolver: zodResolver(orgSettingsSchema),
    defaultValues: settings,
  })

  function onSubmit(values: OrgSettingsInput) {
    startTransition(async () => {
      const result = await updateOrgSettings(values)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(messages.common.saved)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4">
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{settingsMessages.org.timezoneLabel}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultPassingScore"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{settingsMessages.org.passingScoreLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? messages.common.loading : messages.common.save}
        </Button>
      </form>
    </Form>
  )
}
