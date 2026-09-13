"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { Input } from "@/components/ui/input"

const DEBOUNCE_MS = 300

interface SearchInputProps {
  /** Query-string key written to the URL (the RSC list reads it back). */
  paramName?: string
  placeholder: string
}

/**
 * Debounced search box that drives a Server Component list through the URL.
 * Typing replaces the history entry (no back-button spam) and resets to page 1.
 */
export function SearchInput({ paramName = "q", placeholder }: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get(paramName) ?? "")
  const debounced = useDebouncedValue(value, DEBOUNCE_MS)

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const current = params.get(paramName) ?? ""

    if (current === debounced) {
      return
    }

    if (debounced) {
      params.set(paramName, debounced)
    } else {
      params.delete(paramName)
    }
    params.delete("page")

    router.replace(`${pathname}?${params.toString()}`)
  }, [debounced, paramName, pathname, router, searchParams])

  return (
    <div className="relative w-full sm:max-w-xs">
      <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  )
}
