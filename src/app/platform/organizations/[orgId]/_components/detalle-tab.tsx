"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { messages } from "@/lib/messages/es"
import { orgMessages } from "@/lib/messages/admin-organizations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { updateOrganization } from "@/features/organizations/actions/update-organization"
import { setOrganizationStatus } from "@/features/organizations/actions/set-organization-status"
import type { OrganizationSummary } from "@/features/organizations/types"

const renameSchema = z.object({ name: z.string().trim().min(2).max(120) })
type RenameInput = z.infer<typeof renameSchema>

interface DetalleTabProps {
  organization: OrganizationSummary
}

/** Rename form + activate/deactivate toggle for the platform org detail page. */
export function DetalleTab({ organization }: DetalleTabProps) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<RenameInput>({ resolver: zodResolver(renameSchema), defaultValues: { name: organization.name } })

  function onRename(values: RenameInput) {
    startTransition(async () => {
      const result = await updateOrganization({ organizationId: organization.id, name: values.name })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(messages.common.saved)
    })
  }

  const isActive = organization.status === "ACTIVE"
  const nextStatus = isActive ? "INACTIVE" : "ACTIVE"

  return (
    <div className="flex flex-col gap-6 pt-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onRename)} className="flex max-w-md flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{orgMessages.create.nameLabel}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? messages.common.loading : orgMessages.detail.renameSubmit}
          </Button>
        </form>
      </Form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{orgMessages.detail.statusSection}</p>
        <ConfirmDialog
          trigger={
            <Button variant={isActive ? "destructive" : "default"} className="self-start">
              {isActive ? orgMessages.detail.deactivateConfirm : orgMessages.detail.activateConfirm}
            </Button>
          }
          title={isActive ? orgMessages.detail.deactivateTitle : orgMessages.detail.activateTitle}
          description={isActive ? orgMessages.detail.deactivateDescription : orgMessages.detail.activateDescription}
          confirmLabel={isActive ? orgMessages.detail.deactivateConfirm : orgMessages.detail.activateConfirm}
          destructive={isActive}
          successMessage={isActive ? orgMessages.detail.deactivateSuccess : orgMessages.detail.activateSuccess}
          action={setOrganizationStatus}
          input={{ organizationId: organization.id, status: nextStatus }}
        />
      </div>
    </div>
  )
}
