/**
 * Extracts an 11-character YouTube video id from the forms an author is likely
 * to paste, or returns null. Deliberately strict: the id is interpolated into
 * an embed URL, so anything unrecognised must be rejected rather than guessed.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim()

  if (!trimmed) {
    return null
  }

  // A bare id, pasted straight from the URL bar.
  if (VIDEO_ID.test(trimmed)) {
    return trimmed
  }

  let url: URL
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase()

  if (host === "youtu.be") {
    return candidate(url.pathname.slice(1))
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null
  }

  if (url.pathname === "/watch") {
    return candidate(url.searchParams.get("v") ?? "")
  }

  // /embed/<id>, /v/<id>, /shorts/<id>, /live/<id>
  const match = url.pathname.match(/^\/(embed|v|shorts|live)\/([^/?#]+)/)
  if (match) {
    return candidate(match[2] ?? "")
  }

  return null
}

function candidate(value: string): string | null {
  return VIDEO_ID.test(value) ? value : null
}
