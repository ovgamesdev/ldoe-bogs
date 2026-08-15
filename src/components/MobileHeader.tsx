'use client'

import { TranslationKey, useLanguage } from '@/context/LanguageContext'
import { MapKey } from '@/lib/initial-data'
import React, { useEffect, useRef, useState } from 'react'

interface MobileHeaderProps {
  activeMap: MapKey;
  onMapChange: (map: MapKey) => void;
}

const AVAILABLE_MAPS: MapKey[] = ['swamp_forest', 'wild_bogs'];

const MobileHeaderComponent: React.FC<MobileHeaderProps> = ({ activeMap, onMapChange }) => {
  const { t, language, setLanguage } = useLanguage();
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  // Закрываем выпадающее меню при клике в любое другое место экрана
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setIsMapMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSelectMap = (map: MapKey) => {
    if (map !== activeMap) {
      onMapChange(map);
    }
    setIsMapMenuOpen(false);
  };

  return (
    <div className="mobile-header">
      <div className="map-selector" ref={selectorRef}>
        <button
          id="mobile-map-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMapMenuOpen((prev) => !prev);
          }}
        >
          🗺️ <span id="mobile-map-title">{t(`map_${activeMap}` as TranslationKey)}</span> ▾
        </button>

        <div className={`map-dropdown-menu${isMapMenuOpen ? ' open' : ''}`}>
          {AVAILABLE_MAPS.map((mapId) => (
            <a
              key={mapId}
              className={`map-dropdown-item${activeMap === mapId ? ' active' : ''}`}
              onClick={() => handleSelectMap(mapId)}
            >
              {t(`map_${mapId}` as TranslationKey)}
            </a>
          ))}
        </div>
      </div>

      <div className="lang-selector">
        <span
          className={`lang-tab${language === 'ru' ? ' active' : ''}`}
          onClick={() => setLanguage('ru')}
        >
          RU
        </span>
        {' / '}
        <span
          className={`lang-tab${language === 'en' ? ' active' : ''}`}
          onClick={() => setLanguage('en')}
        >
          EN
        </span>
      </div>
    </div>
  );
};

// Мемоизация: заголовок не должен перерисовываться из-за состояния карты/фильтров,
// а только когда реально меняются activeMap/onMapChange.
export const MobileHeader = React.memo(MobileHeaderComponent);