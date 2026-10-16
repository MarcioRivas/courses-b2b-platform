import type { MetadataRoute } from "next"
import { PROTECTED_ROUTE_PREFIXES, SITE_URL } from "@/lib/constants"

/** /robots.txt — only the public landing and login are crawlable; app areas and token links are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PROTECTED_ROUTE_PREFIXES, "/api/", "/register/", "/register-required", "/logout", "/forbidden"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
