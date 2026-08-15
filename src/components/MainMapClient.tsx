'use client'

import { TranslationKey, useLanguage } from '@/context/LanguageContext'
import { ALL_GROUPS, GroupsKeys, MapKey } from '@/lib/initial-data'
import dynamic from 'next/dynamic'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ImageModal } from './ImageModal'
import type { GroupCount, MapViewInnerHandle } from './MapViewInner'
import { MobileBottomSheet } from './MobileBottomSheet'
import { MobileHeader } from './MobileHeader'

// leaflet обращается к window при загрузке модуля, поэтому карту нельзя
// рендерить на сервере — грузим её только на клиенте.
const MapViewInner = dynamic(
  () => import('./MapViewInner').then((mod) => mod.MapViewInner),
  { ssr: false }
);

export const MainMapClient: React.FC = () => {
  const [activeMap, setActiveMap] = useState<MapKey>('swamp_forest');
  const [activeFilters, setActiveFilters] = useState<Set<GroupsKeys>>(new Set(ALL_GROUPS.filter(g => g !== 'zombie')));
  // Группы, реально присутствующие в markers.json/zones.json текущей карты —
  // именно их показываем в чекбоксах фильтров (см. onGroupsChange у MapViewInner).
  const [availableGroups, setAvailableGroups] = useState<GroupsKeys[]>(ALL_GROUPS);
  // Счётчики (осталось/всего) по каждой группе — приходят из MapViewInner (см. onGroupCounts).
  const [groupCounts, setGroupCounts] = useState<Map<GroupsKeys, GroupCount>>(new Map());
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const mapRef = useRef<MapViewInnerHandle>(null);
  // Координаты мыши обновляются десятки раз в секунду при движении мыши.
  // Держать их в React-состоянии заставляло бы весь дерево (включая карту
  // с сотнями маркеров) перерисовываться на каждый mousemove. Вместо этого
  // пишем текст напрямую в DOM через ref, минуя React-рендер целиком.
  const coordsRef = useRef<HTMLDivElement>(null);
  const handleHoverCoords = useCallback((coords: string) => {
    if (coordsRef.current) coordsRef.current.textContent = coords;
  }, []);
  // Стабильные ссылки на функции — чтобы мемоизированные дочерние компоненты
  // (ImageModal, MobileBottomSheet) не перерисовывались из-за новой инлайн-функции
  // на каждый ре-рендер родителя.
  const handleCloseMobileSheet = useCallback(() => setIsMobileOpen(false), []);
  const handleOpenMobileSheet = useCallback(() => setIsMobileOpen(true), []);
  const handleCloseImageModal = useCallback(() => setModalImage(null), []);

	const { t, language, setLanguage } = useLanguage()

  // Синхронизация URL с состоянием
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mapParam = params.get('map') as MapKey;
    if (mapParam && ['swamp_forest', 'wild_bogs'].includes(mapParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveMap(mapParam);
    }
  }, []);

  const updateUrlParams = (newMap: MapKey, newFilters: Set<GroupsKeys>) => {
    const params = new URLSearchParams(window.location.search);
    params.set('map', newMap);
    params.set('filters', Array.from(newFilters).join(','));
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  // Синхронизируем URL с текущими map/filters в отдельном эффекте (а не прямо
  // внутри обработчиков или, тем более, внутри функции-апдейтера setState).
  // history.replaceState — это побочный эффект, и вызывать его во время фазы
  // рендера (в т.ч. из колбэка setActiveFilters(prev => ...)) запрещено React —
  // именно так возникала ошибка "Cannot update a component (Router) while
  // rendering a different component (MainMapClient)".
  useEffect(() => {
    updateUrlParams(activeMap, activeFilters);
  }, [activeMap, activeFilters]);

  const handleMapChange = useCallback((map: MapKey) => {
    setActiveMap(map);
  }, []);

  const handleToggleFilter = useCallback((group: GroupsKeys) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  const handleShowAll = useCallback(() => {
    setActiveFilters(new Set(ALL_GROUPS));
  }, []);

  const handleHideAll = useCallback(() => {
    setActiveFilters(new Set<GroupsKeys>());
  }, []);

  const handleResetAll = useCallback(() => {
    if (window.confirm(t('confirm_reset_all'))) {
      mapRef.current?.resetAllStatuses();
      setIsMobileOpen(false); // Закрываем шторку, если сброс был вызван из мобильного меню
    }
  }, [t]);

  // Формирует подпись группы с счётчиком "(осталось/всего)", как в старой версии
  const formatGroupLabel = useCallback((group: GroupsKeys) => {
    let label = t(group);
    const counts = groupCounts.get(group);
    if (counts && counts.total !== 1) {
      label += counts.remaining === counts.total ? ` (${counts.total})` : ` (${counts.remaining}/${counts.total})`;
    }
    return label;
  }, [t, groupCounts]);

  // Тултип с подсказкой для группы "Может быть" — текст зависит от карты
  // (на разных картах в случайных зонах спавнится разный лут).
  const getGroupTooltip = useCallback((group: GroupsKeys): string | undefined => {
    if (group !== ('unique_resource' as GroupsKeys)) return undefined;
    return t(`unique_resource_tooltip_${activeMap}` as TranslationKey);
  }, [t, activeMap]);

  return (
    <div>
      {/* Мобильный хэдер: выбор карты и языка */}
      <MobileHeader activeMap={activeMap} onMapChange={handleMapChange} />

      {/* Десктопная панель управления */}
      <div className="top-desktop-ui">
       

        <div className="lang-controls-pc">
          <button className={`lang-btn ${language === 'ru' ? 'active' : ''}`} onClick={() => setLanguage('ru')}>
            RU
          </button>
          <button className={`lang-btn ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>
            EN
          </button>
        </div>

        <div className="action-btns flex-col">
          <button className="action-btn" onClick={handleShowAll}>
            ✅ {t('btn_show')}
          </button>
          <button className="action-btn" onClick={handleHideAll}>
            ❌ {t('btn_hide')}
          </button>
          <button className="action-btn" style={{ background: '#dc3545' }} onClick={handleResetAll}>
            🔄 {t('reset_all')}
          </button>
          <button className="action-btn" style={{ marginTop: "10px" }} onClick={() => window.location.href = 'https://ovgamesdev.github.io/ldoe-scout/'+language}>
            🗺️ {t('scout_maps')} ↗
          </button>
        </div>

				<div className='leaflet-control-layers-separator' />

				 <div className="map-selector-pc" style={{display: 'flex', flexDirection: 'column'}}>
          <label>
            <span>
              <input
                type="radio"
                className="leaflet-control-layers-selector"
                name="leaflet-base-layers"
                checked={activeMap === 'swamp_forest'}
                onChange={() => handleMapChange('swamp_forest')}
              />
              <span> {t('map_swamp_forest')}</span>
            </span>
          </label>
          <label>
            <span>
              <input
                type="radio"
                className="leaflet-control-layers-selector"
                name="leaflet-base-layers"
                checked={activeMap === 'wild_bogs'}
                onChange={() => handleMapChange('wild_bogs')}
              />
              <span> {t('map_wild_bogs')}</span>
            </span>
          </label>
        </div>

				<div className='leaflet-control-layers-separator'/>

        <div className="filter-list-pc">
          {availableGroups.map((group) => (
            <label key={group} className="filter-item-pc" title={getGroupTooltip(group)}>
              <input
                type="checkbox"
                checked={activeFilters.has(group)}
                onChange={() => handleToggleFilter(group)}
              />
              <span>{formatGroupLabel(group)}</span>
            </label>
          ))}
        </div>

        <div style={{ fontSize: '11px', color: '#666', textAlign: 'center', marginTop: '6px' }}>
          {t('unker_credits')}
					<a href="https://www.youtube.com/@UNKER...1" target="_blank" style={{ color: '#e62117', fontWeight: 'bold', textDecoration: 'none' }}>
						UNKER
					</a>
        </div>
      </div>

      {/* Карта Leaflet */}
      <MapViewInner
        ref={mapRef}
        activeMap={activeMap}
        activeFilters={activeFilters}
        onImageClick={setModalImage}
        onHoverCoords={handleHoverCoords}
        onGroupsChange={setAvailableGroups}
        onGroupCounts={setGroupCounts}
      />

      {/* Координаты мыши: обновляются напрямую в DOM (см. coordsRef), без ре-рендера */}
      <div className="coords-info" ref={coordsRef}>X: 0, Y: 0</div>

      {/* Кнопка фильтров на мобильных */}
      <button className="fab-filter-btn" onClick={handleOpenMobileSheet}>
        🔍 {t('filters')}
      </button>

      {/* Мобильная шторка */}
      <MobileBottomSheet
        isOpen={isMobileOpen}
        onClose={handleCloseMobileSheet}
        groups={availableGroups}
        activeFilters={activeFilters}
        onToggleFilter={handleToggleFilter}
        onShowAll={handleShowAll}
        onHideAll={handleHideAll}
        onResetAll={handleResetAll}
        getGroupLabel={formatGroupLabel}
        getGroupTooltip={getGroupTooltip}
      />

      {/* Модальное окно изображения */}
      <ImageModal src={modalImage} onClose={handleCloseImageModal} />
    </div>
  );
};