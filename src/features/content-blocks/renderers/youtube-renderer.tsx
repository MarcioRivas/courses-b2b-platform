interface YoutubeRendererProps {
  data: { videoId: string; title?: string }
}

/** Privacy-friendly embed (youtube-nocookie.com) — no tracking cookie until the viewer presses play. */
export function YoutubeRenderer({ data }: YoutubeRendererProps) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
      <iframe
        className="size-full"
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(data.videoId)}`}
        title={data.title ?? "Video de YouTube"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
