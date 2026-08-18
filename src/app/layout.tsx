import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
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

// Google Analytics 4 measurement ID (формат "G-XXXXXXXXXX").
// Задаётся через .env / переменные окружения GitHub Actions, чтобы не хардкодить
// в коде — если переменная не задана, скрипты GA не подключаются.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID;

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
      <head>
        {/*
          Раньше шрифты Inter/JetBrains Mono/Russo One подключались через
          `@import url(...)` ВНУТРИ main.css. Это заставляло браузер сначала
          полностью скачать main.css, и только ПОТОМ узнать о необходимости
          качать шрифты — на медленном интернете это добавляло лишний
          последовательный round-trip перед тем, как страница вообще
          могла нормально отрисоваться.

          Явные <link> в <head> браузер видит сразу при разборе HTML
          (через preload scanner) и начинает грузить шрифты ПАРАЛЛЕЛЬНО
          с остальным CSS, а не после него. preconnect дополнительно
          заранее устанавливает соединение с доменами Google Fonts.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Russo+One&display=swap"
        />

        {/*
          Google Analytics (GA4). Подключаем через next/script со стратегией
          afterInteractive — скрипт грузится после того, как страница стала
          интерактивной, не блокируя первую отрисовку. Сайт собирается как
          статический экспорт (output: 'export'), поэтому весь код здесь
          выполняется исключительно в браузере — это нормально для gtag.js.
          Если переменная окружения NEXT_PUBLIC_GA_ID не задана, скрипты
          не рендерятся вовсе.
        */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}