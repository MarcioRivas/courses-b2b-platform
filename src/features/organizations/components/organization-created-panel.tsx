"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CopyIcon } from "lucide-react"
import { messages } from "@/lib/messages/es"
import { orgMessages } from "@/lib/messages/admin-organizations"
import { Button } from "@/components/ui/button"

interface OrganizationCreatedPanelProps {
  organizationId: string
  linkToken: string
}

/** Success screen after `create_organization`: the ADMIN link is shown once (D23). */
export function OrganizationCreatedPanel({ organizationId, linkToken }: OrganizationCreatedPanelProps) {
  const [copied, setCopied] = useState(false)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ""
  const link = `${siteUrl}/register/${linkToken}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(messages.common.copied)
    } catch {
      toast.error(messages.errors.INTERNAL)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">{orgMessages.create.successTitle}</h2>
        <p className="text-sm text-muted-foreground">{orgMessages.create.successDescription}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{orgMessages.create.linkLabel}</p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            <CopyIcon />
            {copied ? messages.common.copied : messages.common.copy}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{orgMessages.create.copyHint}</p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="self-start"
        render={<a href={`/platform/organizations/${organizationId}`} />}
      >
        {orgMessages.create.goToOrg}
      </Button>
    </div>
  )
}
