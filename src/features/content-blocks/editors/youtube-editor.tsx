"use client"

import { useState } from "react"
import { parseVideoId } from "@/lib/youtube/parse-video-id"
import { contentMessages } from "@/lib/messages/admin-content"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { YoutubeBlockData } from "../lib/block-editor-types"

interface YoutubeEditorProps {
  value: YoutubeBlockData
  onChange: (value: YoutubeBlockData) => void
  errors?: Record<string, string>
}

export function YoutubeEditor({ value, onChange, errors }: YoutubeEditorProps) {
  const [rawInput, setRawInput] = useState(value.videoId)
  const [parseError, setParseError] = useState(false)

  function handleUrlChange(raw: string) {
    setRawInput(raw)
    const parsed = parseVideoId(raw)
    if (parsed) {
      setParseError(false)
      onChange({ ...value, videoId: parsed })
    } else {
      setParseError(raw.trim().length > 0)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="youtube-url">{contentMessages.blocks.youtube.urlLabel}</Label>
        <Input
          id="youtube-url"
          value={rawInput}
          placeholder={contentMessages.blocks.youtube.urlPlaceholder}
          onChange={(e) => handleUrlChange(e.target.value)}
        />
        {(parseError || errors?.videoId) && (
          <p className="text-sm text-destructive">
            {parseError ? contentMessages.blocks.youtube.invalidUrl : errors?.videoId}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="youtube-title">{contentMessages.blocks.youtube.titleLabel}</Label>
        <Input
          id="youtube-title"
          value={value.title ?? ""}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>
    </div>
  )
}
