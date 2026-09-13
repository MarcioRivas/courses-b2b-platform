"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{messages.errors.INTERNAL}</h1>
      <Button onClick={reset}>{messages.common.retry}</Button>
    </div>
  )
}
