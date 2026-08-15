import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import "./leaflet.css"
import "./main.css"
import "./map.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL('https://ovgamesdev.github.io/ldoe-bogs'),
  title: {
    default: "LDOE Болота — Интерактивная карта",
    template: "%s | LDOE Болота",
  },
  description: "Интерактивная карта локаций игры Last Day on Earth: Survival (LDOE) — Заболоченный лес и Дикие топи. Лут, боссы, зоны спавна и маршруты.",
  keywords: [
    "LDOE",
    "Last Day on Earth",
    "LDOE Болота",
    "LDOE интерактивная карта",
    "Заболоченный лес",
    "Дикие топи",
    "LDOE Bogs",
    "LDOE interactive map",
    "Last Day on Earth survival",
    "карта лута LDOE",
  ],
  authors: [{ name: "ovgamesdev", url: "https://github.com/ovgamesdev" }],
  creator: "ovgamesdev",
  publisher: "ovgamesdev",
  applicationName: "LDOE Болота",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      // { url: "/favicon.svg", type: "image/svg+xml" },
      { url: basePath + "/favicon.ico", sizes: "any" },
      { url: basePath + "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: basePath + "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: basePath + "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}