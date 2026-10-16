import { APP_NAME, SITE_URL } from "@/lib/constants"
import { landingMessages } from "@/lib/messages/landing"

/**
 * schema.org JSON-LD for the landing: tells Google the site name ("Kururu")
 * and the logo to show in search results. Static data, no user input.
 */
export function LandingStructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: APP_NAME,
        url: `${SITE_URL}/`,
        inLanguage: "es",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: APP_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/brand/kururu-mark-512.png`,
        description: landingMessages.meta.description,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // Escape "<" so the JSON can never close the script tag early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}
