'use client';

import { trackEvent } from '@/lib/analytics'
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
    cursor_pos: 'X: {x}, Y: {y}',
    out_of_map: 'За пределами карты',
    unker_credits: 'Специально для сообщества ',
    done: "Готово",
    mark_done: "Отметить как готово",
    mark_ignored: "Не буду",
    undo: "Вернуть",
    reset_all: "Сбросить всё",
    confirm_reset_all: "Вы уверены, что хотите отменить выполнение всех ящиков и вернуть все области на базовые позиции?",
    scout_maps: "Карты Разведки",
    // Категории
    start: 'Начальная точка',
    layer_zones: 'Случайный спавн',
    zombie: 'Зомби',
    location: 'Названия локаций',
    boss: 'Боссы',
    fishing: 'Рыбалка',
    box: 'Ящик',
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
    corpse_keys: 'Ключи от трупов',
    unique_resource: 'Уникальный ресурс',
    unique_resource_tooltip_swamp_forest: 'Случайный спавн\n\n- Кукуруза\n- Росток',
    unique_resource_tooltip_wild_bogs: 'Случайный спавн\n\n- Кукуруза\n- Торф',

    // Подписи предустановленных позиций area (generic-слоты, общие для всех area,
    // но у каждой area — свои offsetX/offsetY на каждой из них).
    pos_top_left: 'Верхний левый',
    pos_top_center: 'Верхний центр',
    pos_top_right: 'Верхний правый',
    pos_left: 'Слева',
    pos_center: 'Центр',
    pos_right: 'Справа',
    pos_bottom: 'Снизу',
    pos_bottom_left: 'Нижний левый',
    pos_bottom_center: 'Нижний центр',
    pos_bottom_right: 'Нижний правый',

    // Названия area — показываются в попапе позиции области (вместо названия позиции).
    loc_corn_bed: 'Грядка кукурузы',
    loc_houses: 'Дома',
    loc_sprout_bed: 'Грядка ростков',
    loc_alligators: 'Аллигаторы',
    loc_ash_storage: 'Хранилище ясеня',
    loc_antimony_extractor: 'Экстрактор сурьмы',
    loc_ash_sawmill: 'Пилорама ясень',
    loc_peat_quarry: 'Торфяной карьер',
    loc_sulfur_extractor: 'Экстрактор серы',
    loc_tent_camp: 'Палаточный лагерь',
    loc_lead_extractor: 'Экстрактор свинца',
    loc_broken_extractor: 'Сломанный экстрактор',

    // Попап позиции area (AreaPositionPopupContent) — доступен всем пользователям,
    // не только в dev-режиме.
    area_position_confirmed: 'Положение подтверждено',
    area_position_unconfirmed: 'Положение не подтверждено',
    confirm_position: 'Подтвердить положение',
    rotation_label: 'Поворот',
    rotation_reset: 'сброс',
    rotate_by_deg: 'Повернуть на {deg}°',
    save_rotation_as_base: 'Сохранить поворот как базовый',
    switch_to: 'Сменить на',
    loot_alt: 'Лут',
    loot_fullsize_alt: 'Лут (полный размер)',
  },
  en: {
    siteTitle: 'LDOE Bogs — Interactive Map',
    siteDescription: 'Interactive map for Last Day on Earth: Survival (LDOE). Track locations, loot, bosses, and zones across the Swamp Forest and Wild Bogs.',
    
    map_swamp_forest: 'Swamp Forest',
    map_wild_bogs: 'Wild Bogs',
    btn_hide: 'Hide All',
    btn_show: 'Show All',
    filters: 'Filters',
    cursor_pos: 'X: {x}, Y: {y}',
    out_of_map: 'Out of map bounds',
    unker_credits: 'Specially for the community ',
    done: "Done",
    mark_done: "Mark as done",
    mark_ignored: "Ignore",
    undo: "Undo",
    reset_all: "Reset All",
    confirm_reset_all: "Are you sure you want to reset all boxes and move all areas back to their base positions?",
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
    corpse_keys: 'Corpse Keys',
    unique_resource: 'Unique Resource',
    unique_resource_tooltip_swamp_forest: 'Random spawn\n\n- Corn\n- Sprout',
    unique_resource_tooltip_wild_bogs: 'Random spawn\n\n- Corn\n- Peat',

    // Preset area-position slot labels (generic slots shared by every area, each
    // area has its own offsetX/offsetY for each of them).
    pos_top_left: 'Top left',
    pos_top_center: 'Top center',
    pos_top_right: 'Top right',
    pos_left: 'Left',
    pos_center: 'Center',
    pos_right: 'Right',
    pos_bottom: 'Bottom',
    pos_bottom_left: 'Bottom left',
    pos_bottom_center: 'Bottom center',
    pos_bottom_right: 'Bottom right',

    // Area display names — shown in the area position popup instead of the position name.
    loc_corn_bed: 'Corn Patch',
    loc_houses: 'Houses',
    loc_sprout_bed: 'Sprout Patch',
    loc_alligators: 'Alligators',
    loc_ash_storage: 'Ash Storage',
    loc_antimony_extractor: 'Antimony Extractor',
    loc_ash_sawmill: 'Ash Sawmill',
    loc_peat_quarry: 'Peat quarry',
    loc_sulfur_extractor: 'Sulfur extractor',
    loc_tent_camp: 'Tent camp',
    loc_lead_extractor: 'Lead extractor',
    loc_broken_extractor: 'Broken extractor',

    // Area position popup (AreaPositionPopupContent) — available to all users,
    // not only in dev mode.
    area_position_confirmed: 'Position confirmed',
    area_position_unconfirmed: 'Position not confirmed',
    confirm_position: 'Confirm position',
    rotation_label: 'Rotation',
    rotation_reset: 'reset',
    rotate_by_deg: 'Rotate by {deg}°',
    save_rotation_as_base: 'Save rotation as base',
    switch_to: 'Switch to',
    loot_alt: 'Loot',
    loot_fullsize_alt: 'Loot (full size)',
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
    if (lang !== language) trackEvent('change_language', { language: lang });
    setLanguageState(lang);
    localStorage.setItem('ldoe_language', lang);
    updateDocumentAndUrl(lang);
  }, [language, updateDocumentAndUrl]);

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