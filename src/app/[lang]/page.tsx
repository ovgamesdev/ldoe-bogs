import { MainMapClient } from '@/components/MainMapClient'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return [
    { lang: 'ru' },
    { lang: 'en' },
  ];
}

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang } = await props.params;
  const isEn = lang === 'en';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const title = isEn
    ? 'LDOE Bogs — Interactive Map'
    : 'LDOE Болота — Интерактивная карта';
  const description = isEn
    ? 'Interactive map for Last Day on Earth: Survival (LDOE). Track locations, loot, bosses, and zones across the Swamp Forest and Wild Bogs.'
    : 'Интерактивная карта локаций игры Last Day on Earth: Survival (LDOE) — Заболоченный лес и Дикие топи: лут, боссы, зоны спавна и маршруты.';

  const path = `/${lang}/`;

  return {
    metadataBase: new URL('https://ovgamesdev.github.io/ldoe-bogs'),
    title,
    description,
    manifest: `${basePath}/site-${isEn ? 'en' : 'ru'}.webmanifest`,
    alternates: {
      canonical: path,
      languages: {
        ru: '/ru/',
        en: '/en/',
      },
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'LDOE Болота',
      locale: isEn ? 'en_US' : 'ru_RU',
      type: 'website',
      images: [{ url: `/og-image-${lang}.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@ovgamesdev',
      title,
      description,
      creator: '@ovgamesdev',
      images: [`/og-image-${lang}.png`],
    },
  };
}

export default async function Page(props: Props) {
  // Распаковываем params, чтобы Next.js корректно привязал этот компонент к статическим путям
  const { lang } = await props.params;
  const isEn = lang === 'en';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: isEn ? 'LDOE Bogs' : 'LDOE Болота',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (Web)',
    url: `https://ovgamesdev.github.io/ldoe-bogs/${lang}/`,
    inLanguage: isEn ? 'en' : 'ru',
    description: isEn
      ? 'Interactive map for Last Day on Earth: Survival (LDOE). Track locations, loot, bosses, and zones.'
      : 'Интерактивная карта локаций игры Last Day on Earth: Survival (LDOE): лут, боссы и зоны спавна.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">
        {isEn
          ? 'LDOE Bogs — Interactive Map for Last Day on Earth: Survival'
          : 'LDOE Болота — Интерактивная карта Last Day on Earth: Survival'}
      </h1>
      <MainMapClient />
    </>
  );
}