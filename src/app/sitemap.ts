import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/constants"

/** /sitemap.xml — the public pages only (everything else sits behind login). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
  ]
}
