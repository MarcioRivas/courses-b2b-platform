import type { Metadata } from "next"
import { Poppins, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { APP_NAME, APP_DESCRIPTION, BASE_OPEN_GRAPH, SITE_URL } from "@/lib/constants"
import "./globals.css"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: BASE_OPEN_GRAPH,
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
