"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"

interface CopyLinkButtonProps {
  token: string
}

/** Builds `${NEXT_PUBLIC_SITE_URL}/register/${token}` and copies it — never logged (tokens are credentials). */
export function CopyLinkButton({ token }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/register/${token}`
    await navigator.clipboard.writeText(url)
    toast.success(messages.common.copied)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      <span className="hidden sm:inline">{messages.common.copy}</span>
    </Button>
  )
}
