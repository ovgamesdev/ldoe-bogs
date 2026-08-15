import type { Metadata } from "next"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  metadataBase: new URL("https://ovgamesdev.github.io/ldoe-bogs"),
  title: "LDOE Болота — Интерактивная карта",
  description: "Интерактивная карта локаций Last Day on Earth: Survival — лут, боссы и зоны спавна.",
  openGraph: {
    title: "LDOE Болота — Интерактивная карта",
    description: "Интерактивная карта локаций Last Day on Earth: Survival — лут, боссы и зоны спавна.",
    url: "/",
    siteName: "LDOE Болота",
    locale: "ru_RU",
    type: "website",
    images: [
      {
        url: `/og-image-ru.png`,
        width: 1200,
        height: 630,
        alt: "LDOE Bogs Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LDOE Болота — Интерактивная карта",
    description: "Интерактивная карта локаций игры Last Day on Earth: Survival — лут, боссы и зоны спавна.",
    creator: "ovgamesdev",
    images: [`/og-image-ru.png`],
  },
};

export default function RootPage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var savedLang = localStorage.getItem('ldoe_language');
                var lang = (savedLang === 'en' || savedLang === 'ru') ? savedLang : (navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru');
                var currentPath = window.location.pathname;
                
                // Проверяем, содержит ли путь уже язык (слэш обязателен, чтобы избежать ложных срабатываний)
                if (!currentPath.match(/\\/(en|ru)(\\/|$)/)) {
                  var newPath = currentPath.endsWith('/') ? currentPath + lang + '/' : currentPath + '/' + lang + '/';
                  window.location.replace(newPath);
                }
              } catch (e) {}
            })();
          `,
        }}
      />
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <p>Загрузка... / Loading...</p>
      </div>
    </>
  );
}