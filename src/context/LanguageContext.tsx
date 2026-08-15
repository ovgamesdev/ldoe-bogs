'use client';

import { useRouter } from 'next/navigation'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Language = 'ru' | 'en';

export const translations = {
  ru: {
    siteTitle: 'LDOE Болота — Интерактивная карта',
    siteDescription: 'Интерактивная карта локаций Last Day on Earth: Survival (LDOE) — Заболоченный лес и Дикие топи: лут, боссы, зоны спавна и маршруты.',

    map_swamp_forest: 'Заболоченный лес',
    map_wild_bogs: 'Дикие топи',
    btn_hide: 'Скрыть всё',
    btn_show: 'Показать всё',
    filters: 'Фильтры',
    wiki_source: 'Источник: LDOE Wiki',
    loot_example: 'Пример лута',
    one: 'Одно из следующих',
    none_or_one: 'Ничего или одно из',
    of_the_following: 'следующего',
    cursor_pos: 'X: {x}, Y: {y}',
    out_of_map: 'За пределами карты',
    unker_credits: 'Специально для сообщества ',
    done: "Готово",
    mark_done: "Отметить как готово",
    mark_ignored: "Не буду",
    undo: "Вернуть",
    reset_all: "Сбросить всё",
    confirm_reset_all: "Вы уверены, что хотите отменить выполнение всех ящиков?",
    scout_maps: "Карты Разведки",
    // Категории
    start: 'Старт',
    layer_zones: 'Случайный спавн',
    zombie: 'Зомби',
    location: 'Локации',
    boss: 'Боссы',
    fishing: 'Рыбалка',
    box: 'Ящики',
    box_winch: "Ящик нужна лебёдка вездехода",
    door_winch: "Дверь нужна лебёдка вездехода",
    barrier: "Путь закрыт. Нужен Таран",
    box_pickup: 'Ящики с лутом',
    motorcycle: 'Мотоциклы',
    airdrop: 'Аирдроп',
    c4: 'Двери C4',
    axe: 'Топор',
    crowbar: 'Лом',
    transistor: 'Транзистор',
    shovel: 'Лопата',
    generator: 'Генератор',
    radio: 'Радио',
    motorcycle_repair: 'Ремонт мотоцикла',
    gas_pump: 'Бензоколонка',
    corpse_keys: 'Ключи от трупов',
    tripwire_trap: 'Растяжки',
    campfire: 'Костер',
    canceling_alarm: 'Отключение тревоги',
    unique_resource: 'Уникальный ресурс',
    unique_resource_tooltip_swamp_forest: 'Случайный спавн\n\n- Кукуруза\n- Росток',
    unique_resource_tooltip_wild_bogs: 'Случайный спавн\n\n- Кукуруза\n- Торф'
  },
  en: {
    siteTitle: 'LDOE Bogs — Interactive Map',
    siteDescription: 'Interactive map for Last Day on Earth: Survival (LDOE). Track locations, loot, bosses, and zones across the Swamp Forest and Wild Bogs.',
    
    map_swamp_forest: 'Swamp Forest',
    map_wild_bogs: 'Wild Bogs',
    btn_hide: 'Hide All',
    btn_show: 'Show All',
    filters: 'Filters',
    wiki_source: 'Source: LDOE Wiki',
    loot_example: 'Loot Example',
    one: 'One of the following',
    none_or_one: 'None or one of',
    of_the_following: 'of the following',
    cursor_pos: 'X: {x}, Y: {y}',
    out_of_map: 'Out of map bounds',
    unker_credits: 'Specially for the community ',
    done: "Done",
    mark_done: "Mark as done",
    mark_ignored: "Ignore",
    undo: "Undo",
    reset_all: "Reset All",
    confirm_reset_all: "Are you sure you want to reset all boxes?",
    scout_maps: "Scout Maps",
    // Categories
    start: 'Start',
    layer_zones: 'Random spawn',
    zombie: 'Zombies',
    location: 'Locations',
    boss: 'Bosses',
    fishing: 'Fishing',
    box: 'Crates',
    box_winch: "Box Needs ATV Winch",
    door_winch: "Door Needs ATV Winch",
    barrier: "Blocked. Need ATV RAM",
    box_pickup: 'Pickup Crates',
    motorcycle: 'Motorcycles',
    airdrop: 'Airdrop',
    c4: 'C4 Doors',
    axe: 'Axe',
    crowbar: 'Crowbar',
    transistor: 'Transistor',
    shovel: 'Shovel',
    generator: 'Generator',
    radio: 'Radio',
    motorcycle_repair: 'Motorcycle Repair',
    gas_pump: 'Gas Pump',
    corpse_keys: 'Corpse Keys',
    tripwire_trap: 'Tripwire Traps',
    campfire: 'Campfire',
    canceling_alarm: 'Cancel Alarm',
    unique_resource: 'Unique Resource',
    unique_resource_tooltip_swamp_forest: 'Random spawn\n\n- Corn\n- Sprout',
    unique_resource_tooltip_wild_bogs: 'Random spawn\n\n- Corn\n- Peat'
  },
};

export type TranslationKey = keyof typeof translations.ru;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'ru';

  const path = window.location.pathname;
  if (path.includes('/en/') || path.endsWith('/en')) return 'en';
  if (path.includes('/ru/') || path.endsWith('/ru')) return 'ru';

  const savedLang = localStorage.getItem('ldoe_language') as Language | null;
  if (savedLang === 'ru' || savedLang === 'en') {
    return savedLang;
  }

  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ru';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode; initialLang?: Language }> = ({ children, initialLang }) => {
  const router = useRouter();
  const [language, setLanguageState] = useState<Language>(() => {
    if (initialLang) return initialLang;
    return getInitialLanguage();
  });

  const updateDocumentAndUrl = useCallback((lang: Language) => {
    if (typeof window === 'undefined') return;

    document.documentElement.lang = lang;
    document.title = translations[lang]['siteTitle'];

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', translations[lang]['siteDescription']);
    }

    router.push(`/${lang}`);
  }, [router]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('ldoe_language', lang);
    updateDocumentAndUrl(lang);
  }, [updateDocumentAndUrl]);

  useEffect(() => {
    if (initialLang && language !== initialLang) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguageState(initialLang);
    }
  }, [initialLang, language]);

  useEffect(() => {
    localStorage.setItem('ldoe_language', language);
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
      document.title = translations[language]['siteTitle'];
    }
  }, [language]);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    let text = translations[language]?.[key] || translations['ru']?.[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
      });
    }
    return text;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};