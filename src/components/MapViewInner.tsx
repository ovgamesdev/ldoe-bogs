'use client';

import { TranslationKey, useLanguage } from '@/context/LanguageContext'
import { ALL_GROUPS, AreaPositionOffset, GroupsKeys, IconKeys, IMapConfig, MapAreaConfig, MapKey, MarkerJSON, STORAGE_PREFIX, ZonesJSON } from '@/lib/initial-data'
import L from 'leaflet'
// import 'leaflet/dist/leaflet.css'
import { trackEvent } from '@/lib/analytics'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Pane, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DevToolsPanel } from './DevToolsPanel'

interface MapViewInnerProps {
  activeMap: MapKey;
  activeFilters: Set<GroupsKeys>;
  isDev: boolean;
  onImageClick: (src: string) => void;
  onHoverCoords: (coords: string) => void;
  // Сообщает наверх, какие группы фактически присутствуют в markers.json/zones.json
  // текущей карты — чтобы UI фильтров не показывал пустые пункты.
  onGroupsChange?: (groups: GroupsKeys[]) => void;
  // Сообщает наверх счётчики (осталось/всего) по каждой группе — для отображения
  // рядом с названием в списке фильтров, как в старой ванильной версии.
  onGroupCounts?: (counts: Map<GroupsKeys, GroupCount>) => void;
}

export interface GroupCount {
  total: number;
  remaining: number;
}

// Императивный API, доступный родителю через ref (например, кнопка "Сбросить всё" в MainMapClient)
export interface MapViewInnerHandle {
  resetAllStatuses: () => void;
}

const MAP_CONFIG: Record<MapKey, IMapConfig> = {
  swamp_forest: {
    width: 59812,
    height: 59801,
		json: `/data/swamp_forest/markers.json`,
		zonesJson: `/data/swamp_forest/zones.json`,
		tilePath: `/tiles/swamp_forest/{z}/{y}/{x}.webp`,
    tileSize: 512,
    minZoom: 0,
    maxZoom: 7
  },
  wild_bogs: {
    width: 55604,
    height: 55604,
		json: `/data/wild_bogs/markers.json`,
		zonesJson: `/data/wild_bogs/zones.json`,
		tilePath: `/tiles/wild_bogs/{z}/{y}/{x}.webp`,
    tileSize: 512,
    minZoom: 0,
    maxZoom: 7
  },
};

// const BASE_URL = 'https://ovgamesdev.github.io/ldoe-bogs';
const BASE_URL = '/ldoe-bogs';

const ICON_CONFIG: Record<string, [string, number]> = {
  start: ['start.webp', 48],
  boss: ['boss.webp', 32],
  unique_resource: ['unique_resource.png', 32],
  motorcycle: ['motorcycle.webp', 32],
  crowbar: ['crowbar.webp', 32],
  axe: ['axe.webp', 32],
  box: ['box.webp', 32],
	box_winch: ['box_winch.png', 48],
  barrier: ['barrier.png', 32],
	door_winch: ['winch.png', 32],
  box_pickup: ['box_pickup.webp', 32],
  fishing: ['fishing.webp', 32],
  zombie: ['zombie.webp', 48],
  transistor: ['use.png', 32],
  c4: ['use.png', 32],
};

// Статус отметки маркера пользователем: выполнено / игнорировать
type MarkerStatus = 'done' | 'ignored';

// Группы, для которых в попапе показываются кнопки "Отметить выполненным" / "Игнорировать"
const STATUS_TRACKED_GROUPS = new Set<GroupsKeys>(['box', 'box_winch', 'ash_tree', 'unique_resource'] as GroupsKeys[]);

const MapEventsHandler: React.FC<{
  activeMap: MapKey;
  onHoverCoords: (coords: string) => void;
  // Пишем последнюю известную точку курсора в пиксельных координатах карты —
  // используется контекстным меню области ("Переместить сюда") без лишнего стейта.
  lastPointRef: React.MutableRefObject<{ x: number; y: number } | null>;
}> = ({ activeMap, onHoverCoords, lastPointRef }) => {
  const { t } = useLanguage()
  const map = useMap();

  // См. аналогичный комментарий в ViewportTracker — мемоизация handlers,
  // чтобы useMapEvents не переподписывался на каждый ре-рендер.
  const handlers = useMemo(
    () => ({
      mousemove(e: L.LeafletMouseEvent) {
        const config = MAP_CONFIG[activeMap];
        const point = map.project(e.latlng, config.maxZoom);
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        lastPointRef.current = { x, y };

        if (x >= 0 && x <= config.width && y >= 0 && y <= config.height) {
          onHoverCoords(t('cursor_pos').replace('{x}', String(x)).replace('{y}', String(y)));
        } else {
          onHoverCoords(t('out_of_map'));
        }
      },
    }),
    [map, activeMap, onHoverCoords, lastPointRef, t]
  );
  useMapEvents(handlers);

  return null;
};

// Ключ localStorage для значения, привязанного к конкретной карте (статусы
// маркеров, положения areas, сохранённый вид и т.п.) — все они используют
// STORAGE_PREFIX сайта, чтобы не конфликтовать с другими проектами на том же
// origin GitHub Pages (см. комментарий у STORAGE_PREFIX в initial-data.ts).
const mapStorageKey = (activeMap: MapKey, suffix: string) => `${STORAGE_PREFIX}:${activeMap}:${suffix}`;

interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

const readSavedView = (activeMap: MapKey): SavedView | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(mapStorageKey(activeMap, 'view')) || 'null') as SavedView | null;
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && Number.isFinite(saved.zoom)) {
      return saved;
    }
  } catch {
    // повреждённое значение в localStorage — игнорируем, поведём себя как при первом заходе
  }
  return null;
};

const MapBoundsController: React.FC<{ activeMap: MapKey }> = ({ activeMap }) => {
  const map = useMap();

  useEffect(() => {
    const config = MAP_CONFIG[activeMap];
    const bounds = L.latLngBounds(
      L.CRS.Simple.pointToLatLng(L.point(0, config.height), config.maxZoom),
      L.CRS.Simple.pointToLatLng(L.point(config.width, 0), config.maxZoom)
    );
    map.setMaxBounds(bounds.pad(0.5));

    // Если для этой карты уже есть сохранённый зум/положение камеры (см.
    // ViewportPersister) — восстанавливаем его вместо того, чтобы каждый раз
    // (при заходе/перезагрузке страницы или переключении карты) показывать
    // её целиком через fitBounds.
    const savedView = readSavedView(activeMap);
    if (savedView) {
      map.setView(L.latLng(savedView.lat, savedView.lng), savedView.zoom, { animate: false });
    } else {
      map.fitBounds(bounds);
    }
  }, [activeMap, map]);

  return null;
};

// Сохраняет текущие зум и положение камеры в localStorage при каждом
// перемещении/зуме карты — отдельно для каждой карты (ключ — activeMap, см.
// viewStorageKey). MapBoundsController читает эти значения при заходе на
// карту/её смене, поэтому вид восстанавливается и после перезагрузки
// страницы, и при переключении между картами в рамках одной сессии.
const ViewportPersister: React.FC<{ activeMap: MapKey }> = ({ activeMap }) => {
  const map = useMap();

  const handlers = useMemo(() => {
    const save = () => {
      const center = map.getCenter();
      const view: SavedView = { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
      localStorage.setItem(mapStorageKey(activeMap, 'view'), JSON.stringify(view));
    };
    return { moveend: save, zoomend: save };
  }, [map, activeMap]);
  useMapEvents(handlers);

  return null;
};

// Отслеживает границы видимой области карты — используется, чтобы не рендерить
// AreaOverlay для областей, которых сейчас нет на экране.
const ViewportTracker: React.FC<{ onBoundsChange: (bounds: L.LatLngBounds) => void }> = ({ onBoundsChange }) => {
  const map = useMap();

  // useMapEvents переподписывается (map.off старых + map.on новых) КАЖДЫЙ РАЗ,
  // когда объект handlers меняет ссылку — а инлайн-объект пересоздавался бы на
  // каждый ре-рендер ViewportTracker (который сам перерендеривается при каждом
  // изменении visibleBounds в родителе, т.к. onBoundsChange это триггерит).
  // Мемоизация разрывает этот цикл: handlers меняется только если реально
  // изменился map или onBoundsChange (оба стабильны — см. handleVisibleBoundsChange).
  const handlers = useMemo(
    () => ({
      moveend: () => onBoundsChange(map.getBounds()),
      zoomend: () => onBoundsChange(map.getBounds()),
    }),
    [map, onBoundsChange]
  );
  useMapEvents(handlers);

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
};

// Ловит клики по карте в dev-режиме: добавление маркера, рисование зоны, снятие выделения.
const DevMapClickHandler: React.FC<{
  activeMap: MapKey;
  onMapClick: (x: number, y: number) => void;
}> = ({ activeMap, onMapClick }) => {
  const map = useMap();
  const handlers = useMemo(
    () => ({
      click(e: L.LeafletMouseEvent) {
        const config = MAP_CONFIG[activeMap];
        const point = map.project(e.latlng, config.maxZoom);
        onMapClick(Math.round(point.x), Math.round(point.y));
      },
    }),
    [map, activeMap, onMapClick]
  );
  useMapEvents(handlers);

  return null;
};

// Отдельный мемоизированный маркер: пересчитывает позицию/иконку/попап только
// когда реально меняются его собственные пропсы, а не при любом ре-рендере
// родителя (например, из-за движения мыши или ввода в другом маркере).
interface MarkerItemProps {
  marker: MarkerJSON;
  index: number;
  isSelected: boolean;
  isDev: boolean;
  editMode: boolean;
  maxZoom: number;
  getIcon: (m: MarkerJSON, isSelected: boolean) => L.DivIcon;
  onMarkerClick: (idx: number) => void;
  onMarkerDragEnd: (idx: number, e: L.DragEndEvent) => void;
  renderPopupContent: (m: MarkerJSON) => React.ReactNode;
}

const MarkerItem = React.memo(function MarkerItem({
  marker,
  index,
  isSelected,
  isDev,
  editMode,
  maxZoom,
  getIcon,
  onMarkerClick,
  onMarkerDragEnd,
  renderPopupContent,
}: MarkerItemProps) {
  const position = useMemo(
    () => L.CRS.Simple.pointToLatLng(L.point(marker.x, marker.y), maxZoom),
    [marker.x, marker.y, maxZoom]
  );

  const icon = useMemo(() => getIcon(marker, isSelected), [marker, isSelected, getIcon]);

  const eventHandlers = useMemo(
    () =>
      isDev
        ? {
            click: () => onMarkerClick(index),
            dragend: (e: L.DragEndEvent) => onMarkerDragEnd(index, e),
          }
        : undefined,
    [isDev, index, onMarkerClick, onMarkerDragEnd]
  );

  return (
    <Marker position={position} icon={icon} draggable={isDev && editMode} eventHandlers={eventHandlers}>
      {marker.group !== 'location' && (
        <Popup autoPan autoPanPaddingTopLeft={[16, 70]} autoPanPaddingBottomRight={[16, 100]} maxWidth={280}>
          {renderPopupContent(marker)}
        </Popup>
      )}
    </Marker>
  );
});

// --- ОБЛАСТИ (MapAreaConfig) ---------------------------------------------
// Область — только отображение (тайлы + собственные маркеры). Редактирование
// area (изменение размера/позиции, quick-edit, удаление/дублирование через
// dev-инструменты) убрано целиком — geometry area теперь берётся из
// areas.json как есть (см. getEffectiveAreaGeom для сдвига по positionId).
interface AreaOverlayProps {
  area: MapAreaConfig;
  maxZoom: number;
  // Активные фильтры групп — маркеры area, скрытые фильтром, не рендерятся,
  // так же как и обычные маркеры карты (см. filteredMarkers).
  activeFilters: Set<GroupsKeys>;
  getIcon: (m: MarkerJSON, isSelected: boolean) => L.DivIcon;
  renderPopupContent: (m: MarkerJSON) => React.ReactNode;
  // Dev-режим редактирования маркеров ВНУТРИ area — те же возможности
  // (выделение, перетаскивание, правка полей), что и у обычных маркеров карты.
  isDev: boolean;
  editMode: boolean;
  // Индекс выделенного маркера внутри markers ЭТОЙ area (по исходному индексу,
  // не по индексу после фильтрации) — null, если выделен маркер другой area/карты.
  selectedIdx: number | null;
  onMarkerClick: (idx: number) => void;
  onMarkerDragEnd: (idx: number, e: L.DragEndEvent) => void;
  // Поворот тайлов area на её текущей позиции, в градусах (см. getAreaRotation
  // в MapViewInnerComponent) — маркеры к этому моменту уже повёрнуты
  // математически (см. getEffectiveAreaGeom), сюда передаём то же значение
  // только для визуального CSS-поворота картинки тайлов.
  rotation: number;
  // Текущая позиция area (её positionId с учётом override, см. areaPositionOverrides
  // в MapViewInnerComponent) — нужна, чтобы скрывать маркеры, привязанные к
  // конкретной позиции (см. MarkerJSON.onlyAtPositionId), когда area стоит на
  // другой позиции. null, если у area вообще нет предустановленных позиций.
  currentPositionId: string | null;
}

const AreaOverlay: React.FC<AreaOverlayProps> = ({
  area,
  maxZoom,
  activeFilters,
  getIcon,
  renderPopupContent,
  isDev,
  editMode,
  selectedIdx,
  onMarkerClick,
  onMarkerDragEnd,
  rotation,
  currentPositionId,
}) => {
  const bounds = useMemo(
    () =>
      L.latLngBounds(
        L.CRS.Simple.pointToLatLng(L.point(area.x, area.y + area.height), maxZoom),
        L.CRS.Simple.pointToLatLng(L.point(area.x + area.width, area.y), maxZoom)
      ),
    [area.x, area.y, area.width, area.height, maxZoom]
  );

  // Индекс считаем ДО фильтрации по activeFilters/позиции, иначе он "плывёт" и
  // клики/выделение/drag начинают попадать не по тем маркерам area.
  // Маркер с заданным onlyAtPositionId существует только на этой позиции area
  // (например, предмет спавнится только в одном из вариантов расположения
  // area) — на других позициях его не рендерим, в т.ч. в dev-режиме: чтобы
  // отредактировать такой маркер, нужно сначала переключить area на его
  // позицию (см. AreaPositionMarker/handleSwitchAreaPosition).
  const visibleMarkers = useMemo(
    () =>
      area.markers
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => activeFilters.has(m.group))
        .filter(({ m }) => !m.onlyAtPositionId || m.onlyAtPositionId === currentPositionId),
    [area.markers, activeFilters, currentPositionId]
  );

  return (
    <>
      {/* Свой pane с zIndex между тайлами карты (200) и зонами/векторами (400) —
          область гарантированно ложится поверх карты, но под зонами и маркерами. */}
      <Pane name={`area-tiles-${area.id}`} style={{ zIndex: 350 }}>
        <AreaLodOverlay tilePath={area.tilePath} bounds={bounds} maxZoom={maxZoom} rotation={rotation} />
      </Pane>

      {/* Собственные маркеры области — обычный markerPane (600), поверх области и зон.
          Скрываем те, чья группа выключена в фильтрах — так же, как обычные маркеры.
          В dev-режиме доступны выделение/drag/правка — как у обычных маркеров. */}
      {visibleMarkers.map(({ m, i }) => (
        <MarkerItem
          key={`area-${area.id}-${i}`}
          marker={m}
          index={i}
          isSelected={isDev && selectedIdx === i}
          isDev={isDev}
          editMode={editMode}
          maxZoom={maxZoom}
          getIcon={getIcon}
          onMarkerClick={onMarkerClick}
          onMarkerDragEnd={onMarkerDragEnd}
          renderPopupContent={renderPopupContent}
        />
      ))}
    </>
  );
};

// --- ПОЗИЦИИ ОБЛАСТЕЙ (не dev-функция) ------------------------------------
// Маленький маркер поверх area, показывающий подтверждено ли её текущее
// положение (среди предустановленных позиций); клик открывает попап
// с подтверждением и списком остальных доступных позиций для переключения.
// Доступен всем пользователям (не только в dev-режиме) — перемещение
// возможно ТОЛЬКО между предустановленными позициями area (area.positions), свободного перетаскивания здесь нет.
interface AreaPositionMarkerProps {
  areaId: string;
  // Переведённое отображаемое имя area (напр. "Экстрактор сурьмы") — то, что
  // показывается в заголовке попапа вместо названия позиции.
  areaName: string;
  centerX: number;
  centerY: number;
  // Список позиций — свой у каждой area (см. MapAreaConfig.positions), а не общий.
  positions: AreaPositionOffset[];
  currentPositionId: string;
  confirmed: boolean;
  maxZoom: number;
  // Подпись позиции (по её generic id: top_left/center/...) для кнопок списка —
  // берётся из переводов (pos_<id>), т.к. у самой позиции больше нет поля name.
  getPositionLabel: (positionId: string) => string;
  // Кто сейчас занимает позицию (id area) — если есть, переключение на неё
  // поменяет обе area местами; показываем это в кнопке.
  positionOccupancy: Map<string, string>;
  getAreaName: (areaId: string) => string;
  onConfirm: (areaId: string) => void;
  onSwitch: (areaId: string, positionId: string) => void;
  // --- поворот текущей позиции (см. AreaPositionOffset.rotation) ---
  // Эффективный поворот (override игрока, если есть, иначе базовый из areas.json).
  rotation: number;
  isDev: boolean;
  // Подстройка поворота под то, что видит игрок — доступна и в dev, и в релизе.
  onRotate: (areaId: string, delta: number) => void;
  onResetRotation: (areaId: string) => void;
  // Только в dev: сохраняет текущий поворот как базовый в areas.json.
  onSaveRotation?: (areaId: string) => void;
  // Проверены ли дев-ом данные ТЕКУЩЕЙ позиции (AreaPositionOffset.verified) —
  // свойство самих данных, не путать с confirmed (см. комментарий в
  // initial-data.ts). Показываем badge только в dev-режиме.
  verified: boolean;
  // Только в dev: переключает verified для текущей позиции.
  onToggleVerified?: (areaId: string) => void;
}

// Содержимое попапа позиции area — вынесено отдельно, чтобы одинаково
// использоваться и в AreaPositionMarker (клик по маркеру-кружку), и в попапе
// зоны (Polygon) при клике по самой зоне случайного спавна (см. ниже).
interface AreaPositionPopupContentProps {
  areaId: string;
  areaName: string;
  positions: AreaPositionOffset[];
  currentPositionId: string;
  confirmed: boolean;
  getPositionLabel: (positionId: string) => string;
  positionOccupancy: Map<string, string>;
  getAreaName: (areaId: string) => string;
  onConfirm: (areaId: string) => void;
  onSwitch: (areaId: string, positionId: string) => void;
  rotation: number;
  isDev: boolean;
  onRotate: (areaId: string, delta: number) => void;
  onResetRotation: (areaId: string) => void;
  onSaveRotation?: (areaId: string) => void;
  verified: boolean;
  onToggleVerified?: (areaId: string) => void;
}

const AreaPositionPopupContent: React.FC<AreaPositionPopupContentProps> = ({
  areaId,
  areaName,
  positions,
  currentPositionId,
  confirmed,
  getPositionLabel,
  positionOccupancy,
  getAreaName,
  onConfirm,
  onSwitch,
  rotation,
  isDev,
  onRotate,
  onResetRotation,
  onSaveRotation,
  verified,
  onToggleVerified,
}) => {
  const { t } = useLanguage();
  const otherPositions = positions.filter((p) => p.id !== currentPositionId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b className="popup-main-title">{areaName}</b>
      <div style={{ fontSize: 12, color: '#999', marginTop: -6 }}>{getPositionLabel(currentPositionId)}</div>

      <div style={{ fontWeight: 'bold', color: confirmed ? '#2e7d32' : '#c62828' }}>
        {confirmed ? `✅ ${t('area_position_confirmed')}` : `❌ ${t('area_position_unconfirmed')}`}
      </div>

      {!confirmed && (
        <button className="map-btn confirm-position-btn" onClick={() => onConfirm(areaId)}>
          ✅ {t('confirm_position')}
        </button>
      )}

      <div style={{ borderTop: '1px solid #444', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 12, color: '#999', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('rotation_label')}: {rotation}°</span>
          {rotation !== 0 && (
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onResetRotation(areaId)}>
              {t('rotation_reset')}
            </span>
          )}
        </div>
        <div className="rotation-btn-row">
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, -90)} title={t('rotate_by_deg', { deg: -90 })}>↺ 90°</button>
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, -15)} title={t('rotate_by_deg', { deg: -15 })}>-15°</button>
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, -1)} title={t('rotate_by_deg', { deg: -1 })}>-1°</button>
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, 1)} title={t('rotate_by_deg', { deg: 1 })}>+1°</button>
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, 15)} title={t('rotate_by_deg', { deg: 15 })}>+15°</button>
          <button className="map-btn map-btn-sm" onClick={() => onRotate(areaId, 90)} title={t('rotate_by_deg', { deg: 90 })}>90° ↻</button>
        </div>
        {isDev && onSaveRotation && (
          <button className="map-btn" style={{ background: '#6a1b9a', marginBottom: 0 }} onClick={() => onSaveRotation(areaId)}>
            💾 {t('save_rotation_as_base')}
          </button>
        )}
      </div>

      {/* Dev-only: точность данных этой позиции (x/y/rotation в areas.json) —
          не путать с confirmed выше (это отдельное состояние игрока про
          текущую позицию area). verified защищает данные от случайной правки:
          drag area / "Сохранить поворот как базовый" запрашивают подтверждение,
          если позиция уже помечена проверенной. */}
      {isDev && (
        <div style={{ borderTop: '1px solid #444', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 'bold', color: verified ? '#2e7d32' : '#c62828' }}>
            {verified ? `🔒 ${t('data_verified')}` : `⚠️ ${t('data_unverified')}`}
          </div>
          {onToggleVerified && (
            <button className="map-btn map-btn-sm" onClick={() => onToggleVerified(areaId)}>
              {verified ? `🔓 ${t('mark_unverified')}` : `🔒 ${t('mark_verified')}`}
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{t('switch_to')}:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 170 }}>
        {otherPositions.map((p) => {
          const occupantId = positionOccupancy.get(p.id);
          const occupantName = occupantId ? getAreaName(occupantId) : null;
          return (
            <button key={p.id} className="map-btn" onClick={() => onSwitch(areaId, p.id)}>
              {getPositionLabel(p.id)}{occupantName ? ` (⇄ ${occupantName})` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const AreaPositionMarkerComponent: React.FC<AreaPositionMarkerProps> = ({
  areaId,
  areaName,
  centerX,
  centerY,
  positions,
  currentPositionId,
  confirmed,
  maxZoom,
  getPositionLabel,
  positionOccupancy,
  getAreaName,
  onConfirm,
  onSwitch,
  rotation,
  isDev,
  onRotate,
  onResetRotation,
  onSaveRotation,
  verified,
  onToggleVerified,
}) => {
  const position = useMemo(
    () => L.CRS.Simple.pointToLatLng(L.point(centerX, centerY), maxZoom),
    [centerX, centerY, maxZoom]
  );

  // В dev-режиме добавляем маленький замочек в угол маркера, если данные
  // текущей позиции помечены проверенными — чтобы видеть это сразу на карте,
  // не открывая попап (см. verified в AreaPositionOffset).
  const icon = useMemo(() => L.divIcon({
    className: 'area-position-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
             font-size:15px;font-weight:bold;color:#fff;cursor:pointer;position:relative;
             background:${confirmed ? 'rgba(46,125,50,0.92)' : 'rgba(198,40,40,0.92)'};
             border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.7);">${confirmed ? '✓' : '?'}${
               isDev && verified
                 ? '<span style="position:absolute;top:-7px;right:-7px;font-size:12px;line-height:1;">🔒</span>'
                 : ''
             }</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }), [confirmed, isDev, verified]);

  return (
    <Marker position={position} icon={icon}>
      <Popup minWidth={230}>
        <AreaPositionPopupContent
          areaId={areaId}
          areaName={areaName}
          positions={positions}
          currentPositionId={currentPositionId}
          confirmed={confirmed}
          getPositionLabel={getPositionLabel}
          positionOccupancy={positionOccupancy}
          getAreaName={getAreaName}
          onConfirm={onConfirm}
          onSwitch={onSwitch}
          rotation={rotation}
          isDev={isDev}
          onRotate={onRotate}
          onResetRotation={onResetRotation}
          onSaveRotation={onSaveRotation}
          verified={verified}
          onToggleVerified={onToggleVerified}
        />
      </Popup>
    </Marker>
  );
};

const AreaPositionMarker = React.memo(AreaPositionMarkerComponent);

// --- DEV: свободное перемещение area внутри её ТЕКУЩЕЙ позиции --------------
// В отличие от AreaPositionMarker (переключение МЕЖДУ предустановленными
// позициями), это — единственный способ подвинуть саму area.positions[i].x/y,
// т.е. поправить, где именно на карте находится конкретная предустановленная
// позиция (см. handleAreaDragEnd в MapViewInner). Виден только в dev-режиме
// при включённом editMode — как и dragging обычных маркеров.
interface AreaDragHandleProps {
  areaId: string;
  centerX: number;
  centerY: number;
  maxZoom: number;
  onDragEnd: (areaId: string, e: L.DragEndEvent) => void;
}

const AreaDragHandleComponent: React.FC<AreaDragHandleProps> = ({ areaId, centerX, centerY, maxZoom, onDragEnd }) => {
  const position = useMemo(
    () => L.CRS.Simple.pointToLatLng(L.point(centerX, centerY), maxZoom),
    [centerX, centerY, maxZoom]
  );

  const icon = useMemo(() => L.divIcon({
    className: 'area-drag-handle',
    html: `<div style="width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;
             font-size:14px;color:#fff;cursor:move;background:rgba(33,150,243,0.92);
             border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.7);">✥</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  }), []);

  const eventHandlers = useMemo(() => ({
    dragend: (e: L.DragEndEvent) => onDragEnd(areaId, e),
  }), [areaId, onDragEnd]);

  return <Marker position={position} icon={icon} draggable eventHandlers={eventHandlers} />;
};

const AreaDragHandle = React.memo(AreaDragHandleComponent);

// Следит за зумом карты и отдаёт подходящий по размеру LOD-файл. bounds не
// меняются между LOD — просто растягиваем разные по весу картинки под один и
// тот же геопрямоугольник.
//
// Рисуем overlay вручную (обычным <img> в <div>), а НЕ через react-leaflet
// <ImageOverlay> — у стандартного ImageOverlay CSS-свойство transform уже
// занято Leaflet-ом под позиционирование (translate3d), перезаписать его под
// rotate() для поворота тайлов area нельзя.
//
// ВАЖНО: чтобы область масштабировалась СИНХРОННО с остальной картой во время
// анимации зума (а не "телепортировалась" в новый размер только после
// zoomend), элемент должен участвовать в том же механизме, что и родные слои
// Leaflet — классе .leaflet-zoom-animated (у него в стилях Leaflet уже есть
// `transition: transform 0.25s ...`, включаемый на время анимации) и событии
// 'zoomanim', которое стреляет ДО начала CSS-перехода с координатами
// ЦЕЛЕВОГО зума — на нём мы сразу выставляем финальный transform, а браузер
// плавно анимирует переход к нему сам (ту же формулу translate+scale
// использует L.ImageOverlay._animateZoom). 'viewreset' — жёсткий пересчёт
// без анимации (когда достигнут целевой зум, при панорамировании и т.п.).
//
// Поворот встраиваем прямо в цепочку transform (вокруг центра последнего
// известного прямоугольника, ДО применения translate3d/scale) — так он
// корректно масштабируется вместе с остальным содержимым во время анимации,
// а transform-origin у элемента всегда 0 0 (как и у остальных
// .leaflet-zoom-animated слоёв Leaflet).
const AreaLodOverlay: React.FC<{
  tilePath: string;
  bounds: L.LatLngBounds;
  maxZoom: number;
  // Поворот тайлов area на её текущей позиции, в градусах (см. getAreaRotation).
  rotation: number;
}> = ({ tilePath, bounds, maxZoom, rotation }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(() => Math.round(map.getZoom()));
  const containerRef = useRef<HTMLDivElement>(null);
  // Последний известный (актуальный на момент последнего reset) размер
  // прямоугольника в пикселях — нужен внутри zoomanim, чтобы вращать вокруг
  // центра ТЕКУЩЕГО (ещё не пересчитанного под новый зум) размера, как это
  // делает сам Leaflet для scale-формулы.
  const lastSizeRef = useRef({ width: 0, height: 0 });
  // Зум, ОТНОСИТЕЛЬНО которого сейчас верны width/height/position в lastSizeRef
  // (т.е. зум на момент последнего reset()). Для непрерывного зума (плавный
  // wheel/pinch) Leaflet может стрелять 'zoomanim' много раз за один жест —
  // если считать scale от live map.getZoom() на каждом кадре, эта величина
  // может успевать "уплыть" между кадрами и разъехаться с lastSizeRef (который
  // обновляется только на 'viewreset', т.е. в конце жеста). Поэтому scale
  // всегда считаем от ЭТОГО зафиксированного значения, а не от map.getZoom().
  const baseZoomRef = useRef(map.getZoom());

  const clampedZoom = Math.max(0, Math.min(maxZoom, zoom));
  const url = `${BASE_URL}${tilePath.replace('{z}', String(clampedZoom))}`;

  const applyTransform = useCallback((offsetX: number, offsetY: number, scale: number) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = lastSizeRef.current;
    const cx = width / 2;
    const cy = height / 2;
    // Порядок (справа налево — так применяются CSS-трансформации): сначала
    // сдвигаем центр прямоугольника в 0,0, крутим, сдвигаем обратно (поворот
    // вокруг собственного центра), затем масштабируем (зум) и сдвигаем в
    // итоговую точку на экране — от transform-origin 0 0.
    el.style.transform =
      `translate3d(${offsetX}px, ${offsetY}px, 0) ` +
      (scale !== 1 ? `scale(${scale}) ` : '') +
      `translate(${cx}px, ${cy}px) rotate(${rotation}deg) translate(${-cx}px, ${-cy}px)`;
  }, [rotation]);

  // Жёсткий пересчёт без анимации: пиксельные width/height + позиция для
  // текущего (уже финального) зума карты. Вызывается при инициализации и на
  // 'viewreset' — том же событии, на котором Leaflet пересчитывает позиции
  // своих собственных слоёв.
  const reset = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
    const bottomRight = map.latLngToLayerPoint(bounds.getSouthEast());
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    lastSizeRef.current = { width, height };
    baseZoomRef.current = map.getZoom();
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    applyTransform(topLeft.x, topLeft.y, 1);
  }, [map, bounds, applyTransform]);

  useEffect(() => {
    reset();
  }, [reset]);

  useMapEvents({
    zoomend: () => setZoom(Math.round(map.getZoom())),
    viewreset: reset,
    // При pinch-зуме (два пальца) Leaflet НЕ анимирует зум через _animateZoom
    // на каждом кадре — вместо этого Map.TouchZoom напрямую двигает панель
    // карты через map._move() на каждый touchmove, и это стреляет событие
    // 'zoom' (не 'zoomanim'!). 'zoomanim' там срабатывает только один раз, в
    // самый конец жеста (когда пальцы отпущены и зум "доезжает"/снэпится).
    // Родные слои Leaflet двигаются бесплатно, т.к. физически лежат в той же
    // DOM-панели, которую двигает _move(). Наш оверлей — отдельный элемент,
    // так что без этого хендлера он "зависает" на месте весь pinch-жест и
    // телепортируется в правильную позицию только по отпусканию пальцев.
    // Ровно так же эту проблему решает сам нативный L.ImageOverlay — он
    // подписан на 'zoom' в дополнение к 'viewreset'/'zoomanim'
    // (см. ImageOverlay.prototype.getEvents).
    zoom: reset,
    // Стреляет один раз в начале анимированного зума с координатами ЦЕЛЕВОГО
    // состояния — сразу выставляем финальный transform, дальше CSS-переход
    // (леафлетовский .leaflet-zoom-anim .leaflet-zoom-animated { transition })
    // доводит его плавно, синхронно с тайлами/маркерами карты.
    zoomanim: (e: L.ZoomAnimEvent) => {
      // _latLngBoundsToNewLayerBounds — внутренний (не документированный) метод
      // Leaflet, но именно им пользуется сам L.ImageOverlay для той же задачи
      // (см. ImageOverlay.prototype._animateZoom) — считает смещение верхнего
      // левого угла в пиксельной системе координат ЦЕЛЕВОГО зума.
      const mapAny = map as unknown as {
        _latLngBoundsToNewLayerBounds?: (b: L.LatLngBounds, zoom: number, center: L.LatLng) => L.Bounds;
      };
      const newBounds = mapAny._latLngBoundsToNewLayerBounds?.(bounds, e.zoom, e.center);
      if (!newBounds) return; // На случай, если приватный метод пропал в новой версии Leaflet — просто не анимируем этот кадр.
      // Считаем scale от baseZoomRef (зафиксирован в reset(), соответствует
      // lastSizeRef), а НЕ от live map.getZoom() — см. комментарий у baseZoomRef.
      const scale = map.getZoomScale(e.zoom, baseZoomRef.current);
      applyTransform(newBounds.min!.x, newBounds.min!.y, scale);
    },
  });

  return (
    <div
      ref={containerRef}
      className="leaflet-zoom-animated"
      style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', pointerEvents: 'none' }}
    >
      <img src={url} style={{ width: '100%', height: '100%', display: 'block' }} draggable={false} alt="" />
    </div>
  );
};

// ---------------------------------------------------------------------------

const MapViewInnerComponent = forwardRef<MapViewInnerHandle, MapViewInnerProps>(({
  activeMap,
  activeFilters,
  isDev,
  onImageClick,
  onHoverCoords,
  onGroupsChange,
  onGroupCounts
}, ref) => {
  const { t, language } = useLanguage()

  const [markers, setMarkers] = useState<MarkerJSON[]>([]);
  const [zones, setZones] = useState<ZonesJSON[]>([]);
  // Статусы маркеров (done/ignored), отмеченные пользователем — хранятся в localStorage
  // отдельно для каждой карты, ключ маркера — "x_y".
  const [markerStatuses, setMarkerStatuses] = useState<Map<string, MarkerStatus>>(new Map());
  // const [cratesData, setCratesData] = useState<CratesDataRegistry>({});

  // Области поверх карты (см. MapAreaConfig) — интерьеры/детализированные под-участки
  // со своим набором тайлов и своими маркерами.
  const [areas, setAreas] = useState<MapAreaConfig[]>([]);

  // На какую позицию сейчас выбрана каждая area (ключ — area.id). Если записи нет —
  // используется area.positionId по умолчанию (из areas.json).
  const [areaPositionOverrides, setAreaPositionOverrides] = useState<Map<string, string>>(new Map());
  // Подтверждено ли пользователем текущее положение area (ключ — area.id).
  // Сбрасывается при смене позиции — новое положение нужно подтвердить заново.
  const [areaConfirmed, setAreaConfirmed] = useState<Map<string, boolean>>(new Map());
  // Поворот area (тайлов + маркеров), который реально видит игрок на текущей
  // позиции — по умолчанию берётся из area.positions[currentPositionId].rotation
  // (см. AreaPositionOffset.rotation в initial-data.ts), но игрок может
  // подстроить его под то, что видит в игре (постройки в LDOE иногда
  // спавнятся повёрнутыми). Ключ — area.id. Хранится в localStorage отдельно
  // для каждой карты, как и areaPositionOverrides/areaConfirmed выше.
  const [areaRotationOverrides, setAreaRotationOverrides] = useState<Map<string, number>>(new Map());

  const config = MAP_CONFIG[activeMap];

  // Загружаем сохранённые статусы при смене карты
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(mapStorageKey(activeMap, 'marker_statuses')) || '[]') as [string, MarkerStatus][];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMarkerStatuses(new Map(saved));
    } catch {
      setMarkerStatuses(new Map());
    }
  }, [activeMap]);

  const handleToggleMarkerStatus = useCallback((key: string, status: MarkerStatus) => {
    trackEvent('marker_status_change', {
      status: markerStatuses.get(key) === status ? 'undo' : status,
      map: activeMap,
    });
    setMarkerStatuses((prev) => {
      const next = new Map(prev);
      // Повторный клик по тому же статусу — снимает отметку
      if (next.get(key) === status) {
        next.delete(key);
      } else {
        next.set(key, status);
      }
      localStorage.setItem(mapStorageKey(activeMap, 'marker_statuses'), JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap, markerStatuses]);

  // Полный сброс всех отметок done/ignored для текущей карты (вызывается извне через ref)
  useImperativeHandle(ref, () => ({
    resetAllStatuses: () => {
      setMarkerStatuses(new Map());
      localStorage.setItem(mapStorageKey(activeMap, 'marker_statuses'), JSON.stringify([]));

      // Сбрасываем и положение areas (override позиции + подтверждение) —
      // "Сбросить всё" должно возвращать области на их базовые позиции.
      setAreaPositionOverrides(new Map());
      localStorage.setItem(mapStorageKey(activeMap, 'area_position_overrides'), JSON.stringify([]));
      setAreaConfirmed(new Map());
      localStorage.setItem(mapStorageKey(activeMap, 'area_confirmed'), JSON.stringify([]));

      setAreaRotationOverrides(new Map());
      localStorage.setItem(mapStorageKey(activeMap, 'area_rotation_overrides'), JSON.stringify([]));
    },
  }), [activeMap]);

  const bounds = useMemo(() => {
    return L.latLngBounds(
      L.CRS.Simple.pointToLatLng(L.point(0, config.height), config.maxZoom),
      L.CRS.Simple.pointToLatLng(L.point(config.width, 0), config.maxZoom)
    );
  }, [config]);

  // useEffect(() => {
  //   fetch(`${BASE_URL}/data/crates_data.json`)
  //     .then((res) => res.json())
  //     .then((data) => setCratesData(data))
  //     .catch((err) => console.warn('Crates data fetch error:', err));
  // }, []);

  useEffect(() => {
    fetch(`${BASE_URL}/data/${activeMap}/markers.json`)
      .then((res) => res.json())
      .then((data: MarkerJSON[]) => setMarkers(data))
      .catch((err) => console.error('Markers fetch error:', err));
  }, [activeMap]);

  useEffect(() => {
    fetch(`${BASE_URL}/data/${activeMap}/zones.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`zones.json ${res.status}`);
        return res.json();
      })
      .then((data: ZonesJSON[]) => setZones(data))
      .catch(() => setZones([])); // Файл зон не обязателен для каждой карты
  }, [activeMap]);

  // Файл областей тоже не обязателен для каждой карты — если его нет, просто нет областей.
  useEffect(() => {
    fetch(`${BASE_URL}/data/${activeMap}/areas.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`areas.json ${res.status}`);
        return res.json();
      })
      .then((data: MapAreaConfig[]) =>
        // Проставляем стабильный statusKey каждому маркеру area (area.id + его
        // индекс в массиве) — сам x/y маркера "плавает" при переключении area
        // на другую предустановленную позицию (см. getEffectiveAreaGeom), а
        // отметка "готово/не буду" должна при этом сохраняться.
        setAreas(
          data.map((a) => ({
            ...a,
            markers: a.markers.map((m, i) => ({ ...m, statusKey: `area_${a.id}_${i}` })),
          }))
        )
      )
      .catch(() => setAreas([]));
  }, [activeMap]);

  // Выбор позиции и подтверждение — состояние конкретного игрока/партии, хранится
  // в localStorage отдельно для каждой карты (как и markerStatuses выше).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(mapStorageKey(activeMap, 'area_position_overrides')) || '[]') as [string, string][];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAreaPositionOverrides(new Map(saved));
    } catch {
      setAreaPositionOverrides(new Map());
    }
    try {
      const saved = JSON.parse(localStorage.getItem(mapStorageKey(activeMap, 'area_confirmed')) || '[]') as [string, boolean][];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAreaConfirmed(new Map(saved));
    } catch {
      setAreaConfirmed(new Map());
    }
    try {
      const saved = JSON.parse(localStorage.getItem(mapStorageKey(activeMap, 'area_rotation_overrides')) || '[]') as [string, number][];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAreaRotationOverrides(new Map(saved));
    } catch {
      setAreaRotationOverrides(new Map());
    }
  }, [activeMap]);

  // Подтвердить текущее положение area.
  const handleConfirmAreaPosition = useCallback((areaId: string) => {
    trackEvent('area_position_confirm', { area: areaId, map: activeMap });
    setAreaConfirmed((prev) => {
      const next = new Map(prev);
      next.set(areaId, true);
      localStorage.setItem(mapStorageKey(activeMap, 'area_confirmed'), JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap]);

  // Переключить area на другую предустановленную позицию (только из её собственного
  // area.positions — свободного перемещения тут нет). Если на целевой позиции уже
  // стоит другая area — меняем их местами (она занимает освободившуюся позицию).
  // Подтверждение и подстройка поворота сбрасываются для обеих — новую позицию
  // (и её базовый поворот из areas.json) нужно подтвердить/подстроить заново.
  const handleSwitchAreaPosition = useCallback((areaId: string, positionId: string) => {
    const movingArea = areas.find((a) => a.id === areaId);
    if (!movingArea) return;
    trackEvent('area_position_switch', { area: areaId, position: positionId, map: activeMap });
    const movingFromPositionId = areaPositionOverrides.get(areaId) ?? movingArea.positionId;
    const occupant = areas.find(
      (a) => a.id !== areaId && (areaPositionOverrides.get(a.id) ?? a.positionId) === positionId
    );

    const nextOverrides = new Map(areaPositionOverrides);
    nextOverrides.set(areaId, positionId);
    if (occupant && movingFromPositionId) {
      nextOverrides.set(occupant.id, movingFromPositionId);
    }
    setAreaPositionOverrides(nextOverrides);
    localStorage.setItem(mapStorageKey(activeMap, 'area_position_overrides'), JSON.stringify(Array.from(nextOverrides.entries())));

    const nextConfirmed = new Map(areaConfirmed);
    let confirmedChanged = nextConfirmed.delete(areaId);
    if (occupant) confirmedChanged = nextConfirmed.delete(occupant.id) || confirmedChanged;
    if (confirmedChanged) {
      setAreaConfirmed(nextConfirmed);
      localStorage.setItem(mapStorageKey(activeMap, 'area_confirmed'), JSON.stringify(Array.from(nextConfirmed.entries())));
    }

    const nextRotationOverrides = new Map(areaRotationOverrides);
    let rotationChanged = nextRotationOverrides.delete(areaId);
    if (occupant) rotationChanged = nextRotationOverrides.delete(occupant.id) || rotationChanged;
    if (rotationChanged) {
      setAreaRotationOverrides(nextRotationOverrides);
      localStorage.setItem(mapStorageKey(activeMap, 'area_rotation_overrides'), JSON.stringify(Array.from(nextRotationOverrides.entries())));
    }
  }, [activeMap, areas, areaPositionOverrides, areaConfirmed, areaRotationOverrides]);

  // Поворачивает area на `delta` градусов относительно ТЕКУЩЕГО эффективного
  // поворота (override, если уже есть, иначе базовый из positions[].rotation).
  // Доступно и в dev, и в релизе (см. AreaPositionPopupContent) — сохраняется
  // в localStorage сразу же.
  const handleRotateArea = useCallback((areaId: string, delta: number) => {
    setAreaRotationOverrides((prev) => {
      const area = areas.find((a) => a.id === areaId);
      const currentPositionId = areaPositionOverrides.get(areaId) ?? area?.positionId;
      const basePos = area?.positions?.find((p) => p.id === currentPositionId);
      const current = prev.get(areaId) ?? basePos?.rotation ?? 0;
      const next = new Map(prev);
      next.set(areaId, ((current + delta) % 360 + 360) % 360);
      localStorage.setItem(mapStorageKey(activeMap, 'area_rotation_overrides'), JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap, areas, areaPositionOverrides]);

  // Сбрасывает пользовательскую подстройку поворота — area возвращается к
  // базовому повороту своей текущей позиции (как в areas.json).
  const handleResetAreaRotation = useCallback((areaId: string) => {
    setAreaRotationOverrides((prev) => {
      if (!prev.has(areaId)) return prev;
      const next = new Map(prev);
      next.delete(areaId);
      localStorage.setItem(mapStorageKey(activeMap, 'area_rotation_overrides'), JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap]);

  // Проверены ли дев-ом данные ТЕКУЩЕЙ позиции area (AreaPositionOffset.verified) —
  // свойство самих данных из areas.json, не путать с areaConfirmed (состояние
  // игрока в localStorage). Используется и для badge в попапе, и чтобы решить,
  // нужно ли запрашивать подтверждение перед правкой (см. handleAreaDragEnd,
  // handleSaveAreaRotation ниже).
  const getPositionVerified = useCallback((area: MapAreaConfig): boolean => {
    if (!area.positions) return false;
    const currentPositionId = areaPositionOverrides.get(area.id) ?? area.positionId;
    return !!area.positions.find((p) => p.id === currentPositionId)?.verified;
  }, [areaPositionOverrides]);

  // Dev: сохраняет текущий (возможно, подстроенный) поворот как БАЗОВЫЙ для
  // текущей позиции area — прямо в состояние areas, откуда его заберёт
  // handleExportAreas. Локальный override после этого снимаем — новое базовое
  // значение и так совпадает с тем, что было видно на экране.
  const handleSaveAreaRotation = useCallback((areaId: string) => {
    const area = areas.find((a) => a.id === areaId);
    // Как и в handleAreaDragEnd — правка данных уже проверенной позиции
    // требует явного подтверждения.
    if (area && getPositionVerified(area) && !window.confirm(t('confirm_edit_verified_position'))) {
      return;
    }

    trackEvent('area_rotation_save', { area: areaId, map: activeMap });
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== areaId || !a.positions) return a;
        const currentPositionId = areaPositionOverrides.get(areaId) ?? a.positionId;
        const basePos = a.positions.find((p) => p.id === currentPositionId);
        const rotation = areaRotationOverrides.get(areaId) ?? basePos?.rotation ?? 0;
        return {
          ...a,
          positions: a.positions.map((p) => (p.id === currentPositionId ? { ...p, rotation } : p)),
        };
      })
    );
    setAreaRotationOverrides((prev) => {
      if (!prev.has(areaId)) return prev;
      const next = new Map(prev);
      next.delete(areaId);
      localStorage.setItem(mapStorageKey(activeMap, 'area_rotation_overrides'), JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap, areas, areaPositionOverrides, areaRotationOverrides, getPositionVerified, t]);

  // Эффективный поворот area на её ТЕКУЩЕЙ позиции: пользовательская подстройка
  // (areaRotationOverrides), если есть, иначе базовый поворот текущей позиции
  // из areas.json (AreaPositionOffset.rotation), иначе 0. Работает и с "сырой"
  // area из состояния areas, и с уже смещённой через getEffectiveAreaGeom —
  // id/positions/positionId у неё не меняются.
  const getAreaRotation = useCallback((area: MapAreaConfig): number => {
    const override = areaRotationOverrides.get(area.id);
    if (override !== undefined) return override;
    if (!area.positions) return 0;
    const currentPositionId = areaPositionOverrides.get(area.id) ?? area.positionId;
    const pos = area.positions.find((p) => p.id === currentPositionId);
    return pos?.rotation ?? 0;
  }, [areaRotationOverrides, areaPositionOverrides]);

  // Dev: переключает verified для ТЕКУЩЕЙ позиции area — пишет прямо в
  // состояние areas, откуда заберёт handleExportAreas.
  const handleToggleAreaVerified = useCallback((areaId: string) => {
    trackEvent('area_position_verified_toggle', { area: areaId, map: activeMap });
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== areaId || !a.positions) return a;
        const currentPositionId = areaPositionOverrides.get(areaId) ?? a.positionId;
        return {
          ...a,
          positions: a.positions.map((p) =>
            p.id === currentPositionId ? { ...p, verified: !p.verified } : p
          ),
        };
      })
    );
  }, [activeMap, areaPositionOverrides]);

  // Пересчитывает геометрию area (её x/y + маркеры) под текущую выбранную позицию:
  // смещает area.x/y и все её маркеры на разницу между текущей позицией и базовой
  // (area.positionId) из СВОЕГО списка area.positions, затем поворачивает маркеры
  // вокруг центра area на getAreaRotation(area) градусов — width/height area не
  // меняются, сама область просто переезжает и/или крутится целиком. Сам тайл
  // area поворачивается визуально через CSS (см. AreaLodOverlay/rotation), здесь
  // мы поворачиваем только координаты маркеров, чтобы они совпадали с картинкой.
  // Примечание: полигон случайной зоны (zones.json, привязанной к area через
  // positionId) при этом и сдвигается, и крутится вместе с area (см. zonePolygons).
  const getEffectiveAreaGeom = useCallback((area: MapAreaConfig): MapAreaConfig => {
    let dx = 0, dy = 0;
    if (area.positionId && area.positions && area.positions.length > 0) {
      const basePos = area.positions.find((p) => p.id === area.positionId);
      const currentPositionId = areaPositionOverrides.get(area.id) ?? area.positionId;
      const currentPos = area.positions.find((p) => p.id === currentPositionId);
      if (basePos && currentPos) {
        dx = currentPos.x - basePos.x;
        dy = currentPos.y - basePos.y;
      }
    }

    const rotation = getAreaRotation(area);
    if (dx === 0 && dy === 0 && rotation === 0) return area;

    const centerX = area.x + dx + area.width / 2;
    const centerY = area.y + dy + area.height / 2;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotatePoint = (px: number, py: number) => {
      const tx = px - centerX;
      const ty = py - centerY;
      return {
        x: centerX + tx * cos - ty * sin,
        y: centerY + tx * sin + ty * cos,
      };
    };

    return {
      ...area,
      x: area.x + dx, y: area.y + dy,
      markers: area.markers.map((m) => {
        const p = rotatePoint(m.x + dx, m.y + dy);
        return { ...m, x: Math.round(p.x), y: Math.round(p.y) };
      }),
    };
  }, [areaPositionOverrides, getAreaRotation]);

  // Множество id area, чьё текущее положение подтверждено — используется, чтобы
  // красить связанную с ней зону (layer_zones, ZonesJSON.positionId === area.id)
  // зелёным вместо красного.
  const confirmedAreaIds = useMemo(() => {
    const set = new Set<string>();
    areas.forEach((a) => {
      if (areaConfirmed.get(a.id)) set.add(a.id);
    });
    return set;
  }, [areas, areaConfirmed]);

  // Кто сейчас занимает какую позицию (ключ — id позиции, значение — id area) —
  // используется, чтобы в попапе показать, с какой area произойдёт обмен местами
  // при переключении на уже занятую позицию.
  const positionOccupancy = useMemo(() => {
    const map = new Map<string, string>();
    areas.forEach((a) => {
      const pid = areaPositionOverrides.get(a.id) ?? a.positionId;
      if (pid) map.set(pid, a.id);
    });
    return map;
  }, [areas, areaPositionOverrides]);

  // Переведённое отображаемое имя area — используется в попапе позиции.
  const getAreaName = useCallback((areaId: string): string => {
    return t(`loc_${areaId}` as TranslationKey);
  }, [t]);

  // Смещение (dx, dy), на которое сейчас сдвинута area относительно своей базовой
  // позиции — используется, чтобы вместе с area двигать и её зону в zonePolygons.
  const getAreaOffset = useCallback((area: MapAreaConfig): { dx: number; dy: number } => {
    const eff = getEffectiveAreaGeom(area);
    return { dx: eff.x - area.x, dy: eff.y - area.y };
  }, [getEffectiveAreaGeom]);

  // Подпись позиции по её generic id (top_left/top_center/.../bottom_right) — берётся
  // из переводов, т.к. сама позиция (AreaPositionOffset) больше не хранит имя.
  const getPositionLabel = useCallback((positionId: string): string => {
    return t(`pos_${positionId}` as TranslationKey) || positionId;
  }, [t]);

  // Кэш готовых L.divIcon по маркеру: пока "подпись" маркера (координаты,
  // группа/иконка, угол, статус, выделение, перевод) не изменилась — отдаём
  // тот же самый объект иконки, вместо того чтобы пересоздавать div/img на
  // каждый ре-рендер (это дорого при сотнях маркеров и вызывает лишние
  // marker.setIcon() внутри react-leaflet).
  const iconCacheRef = useRef<Map<string, { sig: string; icon: L.DivIcon }>>(new Map());

  const createCustomIcon = useCallback((m: MarkerJSON, isSelected: boolean = false): L.DivIcon => {
    const status = markerStatuses.get(m.statusKey ?? `${m.x}_${m.y}`);
    const cacheKey = `${m.x}_${m.y}`;
    const sig = m.group === 'location'
      ? `loc|${m.text}|${isSelected}|${language}`
      : `mk|${m.icon || m.group}|${m.angle || 0}|${status || ''}|${isSelected}`;

    const cached = iconCacheRef.current.get(cacheKey);
    if (cached && cached.sig === sig) {
      return cached.icon;
    }

    let icon: L.DivIcon;
    if (m.group === 'location') {
      icon = L.divIcon({
        className: 'location-title',
        html: `<div style="${isSelected ? 'outline:2px solid #f44336;border-radius:4px;' : ''}">${t(m.text as TranslationKey)}</div>`,
        iconSize: [200, 40],
        iconAnchor: [100, 20],
      });
    } else {
      const [fileName, defaultSize] = ICON_CONFIG[m.icon || m.group] || ['box.webp', 32];
      const iconUrl = `${BASE_URL}/assets/markers/${fileName}`;
      const selectedStyle = isSelected
        ? 'filter: drop-shadow(0px 0px 6px red); outline: 2px solid red; outline-offset: 2px; border-radius: 50%; background: rgba(255,0,0,0.3);'
        : '';

      // Стиль в зависимости от статуса (done/ignored)
      let opacity = 1;
      let statusFilter = '';
      if (status === 'done') {
        opacity = 0.3;
      } else if (status === 'ignored') {
        opacity = 0.5;
        statusFilter = 'grayscale(100%) sepia(100%) hue-rotate(330deg) saturate(500%)';
      }

      icon = L.divIcon({
        className: 'custom-icon leaflet-marker-icon',
        html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;opacity:${opacity};${selectedStyle}">
               <img src="${iconUrl}" style="width:100%;height:100%;transform:rotate(${m.angle || 0}deg);pointer-events:none;filter:${statusFilter};" />
             </div>`,
        iconSize: [defaultSize, defaultSize],
        iconAnchor: [defaultSize / 2, defaultSize / 2],
      });
    }

    iconCacheRef.current.set(cacheKey, { sig, icon });
    return icon;
  }, [markerStatuses, t, language]);

  const renderPopupContent = useCallback((m: MarkerJSON) => {
    const statusKey = m.statusKey ?? `${m.x}_${m.y}`;
    const status = markerStatuses.get(statusKey);
    const showStatusButtons = STATUS_TRACKED_GROUPS.has(m.group);

    return (
      <div className="popup-container-center">
        <b className="popup-main-title">{t(m.text as TranslationKey)}</b>

        {isDev && (
          <>
            <div onClick={() => navigator.clipboard.writeText(`"x": ${m.x}`).catch((err) => console.error('Clipboard error:', err))}>
              x: {m.x}
            </div>
            <div onClick={() => navigator.clipboard.writeText(`"y": ${m.y}`).catch((err) => console.error('Clipboard error:', err))}>
              y: {m.y}
            </div>
          </>
        )}

        {m.group === 'unique_resource' && (
          <div className="popup-loot-body">
            {(() => {
              const [header, ...items] = t(`unique_resource_tooltip_${activeMap}` as TranslationKey)
                .split('\n')
                .filter(Boolean);
              return (
                <>
                  <div className="popup-section-title">{header}</div>
                  <ul className="popup-loot-list">
                    {items.map((line, idx) => (
                      <li key={idx}>{line.replace(/^-\s*/, '• ')}</li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>
        )}

        {showStatusButtons && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
            {status !== 'ignored' && (
              <button className="map-btn" onClick={() => handleToggleMarkerStatus(statusKey, 'done')}>
                {status === 'done' ? `↩ ${t('undo')}` : `✅ ${t('mark_done')}`}
              </button>
            )}
            {status !== 'done' && (
              <button className="map-btn" onClick={() => handleToggleMarkerStatus(statusKey, 'ignored')}>
                {status === 'ignored' ? `↩ ${t('undo')}` : `❌ ${t('mark_ignored')}`}
              </button>
            )}
          </div>
        )}

        {m.image && (
          <div className="popup-image-wrapper">
            <img
              src={`${BASE_URL}/images/loot/${m.image}`}
              className="popup-loot-img"
              alt={t('loot_alt')}
              onClick={() => onImageClick(`${BASE_URL}/images/loot/${m.image}`)}
            />
          </div>
        )}
      </div>
    );
  }, [markerStatuses, t, onImageClick, activeMap]);

  const filteredMarkers = useMemo(() => {
    return markers
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => activeFilters.has(m.group));
  }, [markers, activeFilters]);

  const zonesVisible = activeFilters.has('layer_zones' as GroupsKeys);

  const zonePolygons = useMemo(() => {
    return zones.map((z) => {
      // Зона привязана к конкретной area (positionId === area.id) — сдвигаем и
      // поворачиваем её полигон вместе с этой area (getAreaOffset/getAreaRotation),
      // так же как это делается с маркерами area в getEffectiveAreaGeom, и красим
      // по тому, подтверждено ли текущее положение area: красный — нет (или area
      // ещё не задана), зелёный — да.
      let dx = 0, dy = 0;
      let rotatePoint = (px: number, py: number) => ({ x: px, y: py });
      let color = z.color || '#3388ff';
      if (z.positionId) {
        const area = areas.find((a) => a.id === z.positionId);
        if (area) {
          const off = getAreaOffset(area);
          dx = off.dx; dy = off.dy;

          const rotation = getAreaRotation(area);
          if (rotation !== 0) {
            const centerX = area.x + dx + area.width / 2;
            const centerY = area.y + dy + area.height / 2;
            const rad = (rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            rotatePoint = (px: number, py: number) => {
              const tx = px - centerX;
              const ty = py - centerY;
              return {
                x: centerX + tx * cos - ty * sin,
                y: centerY + tx * sin + ty * cos,
              };
            };
          }
        }
        color = confirmedAreaIds.has(z.positionId) ? '#2e7d32' : '#c62828';
      }
      return {
        positions: z.coordinates.map(([x, y]) => {
          const p = rotatePoint(x + dx, y + dy);
          return L.CRS.Simple.pointToLatLng(L.point(p.x, p.y), config.maxZoom);
        }),
        color,
        name: z.name,
        fillOpacity: z.fillOpacity ?? 0.2,
        dashArray: z.dashArray,
        // Привязка к area — используется в рендере, чтобы при клике на зону
        // показывать попап позиции этой area вместо простого названия зоны.
        positionId: z.positionId,
      };
    });
  }, [zones, config, areas, confirmedAreaIds, getAreaOffset, getAreaRotation]);

  // Группы, реально встречающиеся в данных текущей карты (markers.json + zones.json),
  // в каноническом порядке ALL_GROUPS — чтобы фильтры не показывали пустые пункты.
  const availableGroups = useMemo(() => {
    const present = new Set<GroupsKeys>();
    markers.forEach((m) => {
      present.add(m.group);
    });
    // Маркеры внутри areas тоже должны учитываться — иначе группы, которые
    // встречаются только внутри area (а не в markers.json верхнего уровня),
    // не попадали бы в список фильтров.
    areas.forEach((a) => {
      a.markers.forEach((m) => {
        present.add(m.group);
      });
    });
    if (zones.length > 0) present.add('layer_zones' as GroupsKeys);
    return ALL_GROUPS.filter((g) => present.has(g));
  }, [markers, areas, zones]);

  useEffect(() => {
    onGroupsChange?.(availableGroups);
  }, [availableGroups, onGroupsChange]);

  // Счётчики (осталось/всего) по каждой группе маркеров — считаем только для
  // обычных групп (не location, не zones), как в ванильной версии.
  const groupCounts = useMemo(() => {
    const counts = new Map<GroupsKeys, GroupCount>();
    markers.forEach((m) => {
      if (m.group === 'location') return;
      const entry = counts.get(m.group) || { total: 0, remaining: 0 };
      entry.total += 1;
      if (!markerStatuses.has(`${m.x}_${m.y}`)) {
        entry.remaining += 1;
      }
      counts.set(m.group, entry);
    });
    // Маркеры areas — считаем по тому же принципу, статус смотрим по их
    // стабильному statusKey (см. AreaOverlay/getEffectiveAreaGeom).
    areas.forEach((a) => {
      a.markers.forEach((m) => {
        if (m.group === 'location') return;
        const entry = counts.get(m.group) || { total: 0, remaining: 0 };
        entry.total += 1;
        if (!markerStatuses.has(m.statusKey ?? `${m.x}_${m.y}`)) {
          entry.remaining += 1;
        }
        counts.set(m.group, entry);
      });
    });
    return counts;
  }, [markers, areas, markerStatuses]);

  useEffect(() => {
    onGroupCounts?.(groupCounts);
  }, [groupCounts, onGroupCounts]);

  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newMarkerGroup, setNewMarkerGroup] = useState<string>('start');
  const [deleteGroupValue, setDeleteGroupValue] = useState<string>('start');
  // Куда добавлять новые маркеры в addMode, и куда "переместить" выделенный
  // маркер верхнего уровня: '' — обычные markers.json карты, иначе — id area
  // (её markers в areas.json). Используется одновременно для обоих действий,
  // чтобы не плодить два одинаковых селекта в панели.
  const [newMarkerAreaTarget, setNewMarkerAreaTarget] = useState<string>('');

  // Выделение маркера: либо в markers.json карты ('top'), либо внутри
  // конкретной area в areas.json ('area'). idx — индекс в соответствующем
  // массиве (markers, либо area.markers).
  type MarkerSelection = { scope: 'top'; idx: number } | { scope: 'area'; areaId: string; idx: number };
  const [selection, setSelection] = useState<MarkerSelection | null>(null);

  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<[number, number][]>([]);

  const selectedMarker = useMemo(() => {
    if (!selection) return null;
    if (selection.scope === 'top') return markers[selection.idx] ?? null;
    return areas.find((a) => a.id === selection.areaId)?.markers[selection.idx] ?? null;
  }, [selection, markers, areas]);

  // Список area для выпадающих списков в dev-панели (id + переведённое имя).
  const areaOptions = useMemo(
    () => areas.map((a) => ({ id: a.id, label: getAreaName(a.id) })),
    [areas, getAreaName]
  );

  // Позиции area, которой принадлежит выделенный маркер (только для scope
  // === 'area') — для селекта "Показывать только на позиции" в дев-панели.
  // Пусто, если выделен маркер верхнего уровня или у area нет позиций.
  const selectedMarkerAreaPositions = useMemo(() => {
    if (!selection || selection.scope !== 'area') return [];
    const area = areas.find((a) => a.id === selection.areaId);
    if (!area?.positions?.length) return [];
    return area.positions.map((p) => ({ id: p.id, label: getPositionLabel(p.id) }));
  }, [selection, areas, getPositionLabel]);

  // Последняя известная точка курсора на карте (пиксельные координаты) — на случай,
  // если понадобится центрировать что-то без явного clientX/clientY.
  const lastHoverPointRef = useRef<{ x: number; y: number } | null>(null);

  const [visibleBounds, setVisibleBounds] = useState<L.LatLngBounds | null>(null);
  // Оборачиваем сеттер: ViewportTracker вызывает onBoundsChange с НОВЫМ объектом
  // LatLngBounds на каждый moveend/zoomend, даже если границы фактически не
  // изменились. Если что-то в дереве (например, area-оверлей, переставляющий
  // DOM-стили width/height внутри Pane) провоцирует у Leaflet повторный пересчёт
  // размера контейнера (в 1.9+ там встроенный ResizeObserver), это может снова
  // дёрнуть moveend — и без дедупликации получается бесконечный цикл ре-рендеров
  // ("Maximum update depth exceeded"). .equals() не даёт пройти вниз объекту с
  // теми же координатами, так что React бэйлится и цепочка обрывается.
  const handleVisibleBoundsChange = useCallback((b: L.LatLngBounds) => {
    setVisibleBounds((prev) => (prev && prev.equals(b)) ? prev : b);
  }, []);

  const handleDevMapClick = useCallback((x: number, y: number) => {
    if (isDrawingZone) {
      setZonePoints((prev) => [...prev, [x, y]]);
      return;
    }

    if (addMode) {
      // Клик по карте отдаёт "мировые"/эффективные координаты (с учётом текущего
      // сдвига area, если она сейчас переключена на нестандартную позицию —
      // см. getEffectiveAreaGeom). А markers area.markers хранятся в БАЗОВЫХ
      // координатах — поэтому при добавлении в area вычитаем текущий сдвиг.
      if (newMarkerAreaTarget) {
        const targetArea = areas.find((a) => a.id === newMarkerAreaTarget);
        if (!targetArea) return;
        const offset = getAreaOffset(targetArea);
        const newMarker: MarkerJSON = {
          x: x - offset.dx,
          y: y - offset.dy,
          text: newMarkerGroup === 'location' ? 'loc_new' : `item_${newMarkerGroup}`,
          group: newMarkerGroup as GroupsKeys,
          angle: 0,
        };
        setAreas((prev) =>
          prev.map((a) => {
            if (a.id !== newMarkerAreaTarget) return a;
            const idx = a.markers.length;
            setSelection({ scope: 'area', areaId: a.id, idx });
            return { ...a, markers: [...a.markers, { ...newMarker, statusKey: `area_${a.id}_${idx}` }] };
          })
        );
        return;
      }

      const newMarker: MarkerJSON = {
        x,
        y,
        text: newMarkerGroup === 'location' ? 'loc_new' : `item_${newMarkerGroup}`,
        group: newMarkerGroup as GroupsKeys,
        angle: 0,
      };
      setMarkers((prev) => {
        setSelection({ scope: 'top', idx: prev.length });
        return [...prev, newMarker];
      });
      return;
    }

    if (editMode) {
      setSelection(null);
    }
  }, [isDrawingZone, addMode, newMarkerGroup, editMode, newMarkerAreaTarget, areas, getAreaOffset]);

  const handleMarkerClick = useCallback((idx: number) => {
    if (editMode) setSelection({ scope: 'top', idx });
  }, [editMode]);

  const handleMarkerDragEnd = useCallback((idx: number, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const p = L.CRS.Simple.latLngToPoint(marker.getLatLng(), config.maxZoom);
    setMarkers((prev) => prev.map((m, i) => (i === idx ? { ...m, x: Math.round(p.x), y: Math.round(p.y) } : m)));
  }, [config]);

  // Клик/drag по маркеру ВНУТРИ area (см. AreaOverlay) — тот же принцип, что и
  // для обычных маркеров, но пишем в areas, а не в markers.
  const handleAreaMarkerClick = useCallback((areaId: string, idx: number) => {
    if (editMode) setSelection({ scope: 'area', areaId, idx });
  }, [editMode]);

  const handleAreaMarkerDragEnd = useCallback((areaId: string, idx: number, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const p = L.CRS.Simple.latLngToPoint(marker.getLatLng(), config.maxZoom);
    const area = areas.find((a) => a.id === areaId);
    if (!area) return;
    // На карте маркер area рисуется со сдвигом (см. getEffectiveAreaGeom) —
    // при сохранении обратно в area.markers вычитаем этот сдвиг, чтобы
    // получить БАЗОВЫЕ координаты (как в areas.json).
    const offset = getAreaOffset(area);
    const x = Math.round(p.x) - offset.dx;
    const y = Math.round(p.y) - offset.dy;
    setAreas((prev) =>
      prev.map((a) => (a.id !== areaId ? a : { ...a, markers: a.markers.map((m, i) => (i === idx ? { ...m, x, y } : m)) }))
    );
  }, [areas, getAreaOffset, config]);

  // Двигает саму area (dev-режим) — не выбирает другую предустановленную
  // позицию (это делает AreaPositionMarker/handleSwitchAreaPosition), а
  // поправляет координаты ТЕКУЩЕЙ позиции (area_id на currentPositionId в
  // её собственном positions[]). Если area сейчас стоит на своей базовой
  // позиции (area.positionId, без override) — синхронно двигаем и area.x/y +
  // все её markers, чтобы файл оставался согласованным (см. комментарий у
  // fetch areas.json: area.x/y всегда равны positions[positionId]).
  const handleAreaDragEnd = useCallback((areaId: string, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const p = L.CRS.Simple.latLngToPoint(marker.getLatLng(), config.maxZoom);
    const area = areas.find((a) => a.id === areaId);
    if (!area) return;

    const eff = getEffectiveAreaGeom(area);
    const oldCenterX = eff.x + eff.width / 2;
    const oldCenterY = eff.y + eff.height / 2;
    const dx = Math.round(p.x - oldCenterX);
    const dy = Math.round(p.y - oldCenterY);
    if (dx === 0 && dy === 0) return;

    // Позиция помечена проверенной (данные точны, см. AreaPositionOffset.verified) —
    // запрашиваем явное подтверждение перед правкой; при отказе откатываем
    // маркер визуально на место (иначе он остался бы там, куда его перетащили,
    // хотя состояние area не изменилось).
    if (getPositionVerified(area) && !window.confirm(t('confirm_edit_verified_position'))) {
      marker.setLatLng(L.CRS.Simple.pointToLatLng(L.point(oldCenterX, oldCenterY), config.maxZoom));
      return;
    }

    const currentPositionId = areaPositionOverrides.get(areaId) ?? area.positionId;

    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== areaId) return a;
        const isBasePosition = currentPositionId === a.positionId;
        const positions = (a.positions ?? []).map((pos) =>
          pos.id === currentPositionId ? { ...pos, x: pos.x + dx, y: pos.y + dy } : pos
        );
        if (isBasePosition) {
          return {
            ...a,
            x: a.x + dx,
            y: a.y + dy,
            markers: a.markers.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy })),
            positions,
          };
        }
        return { ...a, positions };
      })
    );
  }, [areas, getEffectiveAreaGeom, areaPositionOverrides, config, getPositionVerified, t]);

  const handleChangeSelectedField = useCallback((field: 'text' | 'group' | 'icon' | 'image' | 'angle' | 'onlyAtPositionId', value: string | number) => {
    if (!selection) return;
    const applyField = (m: MarkerJSON): MarkerJSON => {
      if (field === 'group') return { ...m, group: value as GroupsKeys };
      if (field === 'angle') return { ...m, angle: value as number };
      if (field === 'icon') return { ...m, icon: (value as IconKeys) || undefined };
      if (field === 'image') return { ...m, image: (value as string) || undefined };
      // Пустая строка ('' — пункт "Все позиции" в селекте) означает "маркер
      // виден на любой позиции area", поэтому убираем поле, а не пишем ''.
      if (field === 'onlyAtPositionId') return { ...m, onlyAtPositionId: (value as string) || undefined };
      return { ...m, text: value as string };
    };

    if (selection.scope === 'top') {
      setMarkers((prev) => prev.map((m, i) => (i === selection.idx ? applyField(m) : m)));
    } else {
      setAreas((prev) =>
        prev.map((a) =>
          a.id !== selection.areaId ? a : { ...a, markers: a.markers.map((m, i) => (i === selection.idx ? applyField(m) : m)) }
        )
      );
    }
  }, [selection]);

  const handleDeleteSelectedMarker = useCallback(() => {
    if (!selection) return;
    if (selection.scope === 'top') {
      setMarkers((prev) => prev.filter((_, i) => i !== selection.idx));
    } else {
      setAreas((prev) =>
        prev.map((a) => (a.id !== selection.areaId ? a : { ...a, markers: a.markers.filter((_, i) => i !== selection.idx) }))
      );
    }
    setSelection(null);
  }, [selection]);

  const handleDeleteGroup = useCallback(() => {
    if (!confirm(`Удалить все маркеры группы "${deleteGroupValue}"?`)) return;
    setMarkers((prev) => prev.filter((m) => m.group !== deleteGroupValue));
    setSelection(null);
  }, [deleteGroupValue]);

  const handleExportMarkers = useCallback(() => {
    const cleaned = markers.map((m) => {
      const data: MarkerJSON = { ...m };
      if (!data.angle) delete data.angle;
      if (!data.icon) delete data.icon;
      return data;
    });
    const jsonString = JSON.stringify(cleaned, null, 4);
    navigator.clipboard.writeText(jsonString).catch((err) => console.error('Clipboard error:', err));
  }, [markers]);

  // Экспорт areas.json: statusKey у маркеров area на экспорт НЕ пишем — он всё
  // равно перезатирается пересчётом area_<id>_<i> при каждой загрузке areas.json
  // (см. fetch areas.json выше), так что хранить его в файле незачем — только
  // лишние диффы в git при каждом добавлении/удалении маркера.
  const handleExportAreas = useCallback(() => {
    const cleaned = areas.map((a) => ({
      ...a,
      markers: a.markers.map((m) => {
        const data: MarkerJSON = { ...m };
        delete data.statusKey;
        if (!data.angle) delete data.angle;
        if (!data.icon) delete data.icon;
        return data;
      }),
      // rotation: 0 / verified: false — дефолты, не нужно засорять ими файл.
      positions: a.positions?.map((p) => {
        const data: AreaPositionOffset = { ...p };
        if (!data.rotation) delete data.rotation;
        if (!data.verified) delete data.verified;
        return data;
      }),
    }));
    const jsonString = JSON.stringify(cleaned, null, 4);
    navigator.clipboard.writeText(jsonString).catch((err) => console.error('Clipboard error:', err));
  }, [areas]);

  // Переносит ВЫДЕЛЕННЫЙ маркер верхнего уровня (markers.json) в area, выбранную
  // в newMarkerAreaTarget — координаты пересчитываются в базовые (см. handleDevMapClick).
  const handleMoveSelectedMarkerToArea = useCallback(() => {
    if (!selection || selection.scope !== 'top' || !newMarkerAreaTarget) return;
    const marker = markers[selection.idx];
    const targetArea = areas.find((a) => a.id === newMarkerAreaTarget);
    if (!marker || !targetArea) return;

    const offset = getAreaOffset(targetArea);
    const movedMarker: MarkerJSON = { ...marker, x: marker.x - offset.dx, y: marker.y - offset.dy };
    delete movedMarker.statusKey;

    setMarkers((prev) => prev.filter((_, i) => i !== selection.idx));
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== newMarkerAreaTarget) return a;
        const idx = a.markers.length;
        return { ...a, markers: [...a.markers, { ...movedMarker, statusKey: `area_${a.id}_${idx}` }] };
      })
    );
    setSelection({ scope: 'area', areaId: newMarkerAreaTarget, idx: targetArea.markers.length });
  }, [selection, markers, areas, newMarkerAreaTarget, getAreaOffset]);

  const handleToggleEditMode = useCallback((v: boolean) => {
    setEditMode(v);
    if (!v) {
      setSelection(null);
    }
  }, []);

  const handleToggleDrawingZone = useCallback(() => {
    setIsDrawingZone((prev) => !prev);
  }, []);

  const handleUndoZonePoint = useCallback(() => {
    setZonePoints((prev) => prev.slice(0, -1));
  }, []);

  const handleFinishZone = useCallback(() => {
    const jsonString = JSON.stringify(zonePoints);
    navigator.clipboard.writeText(jsonString).catch((err) => console.error('Clipboard error:', err));
    setZonePoints([]);
    setIsDrawingZone(false);
  }, [zonePoints]);

  const zonePreviewPositions = useMemo(
    () => zonePoints.map(([x, y]) => L.CRS.Simple.pointToLatLng(L.point(x, y), config.maxZoom)),
    [zonePoints, config]
  );

  // Детектор размера окна (ResizeObserver): на узких экранах переключаем
  // контролы зума Leaflet в компактный режим через класс ui-compact-zoom.
  useEffect(() => {
    let ro: ResizeObserver | null = null;

    const timeoutId = window.setTimeout(() => {
      const mapContainer = document.getElementById('map');
      if (!mapContainer) return;

      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          mapContainer.classList.toggle('ui-compact-zoom', width < 750);
        }
      });

      ro.observe(mapContainer);
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
      ro?.disconnect();
    };
  }, []);

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      {isDev && (
        <DevToolsPanel
          groupOptions={ALL_GROUPS}
          editMode={editMode}
          onToggleEditMode={handleToggleEditMode}
          addMode={addMode}
          onToggleAddMode={setAddMode}
          newMarkerGroup={newMarkerGroup}
          onChangeNewMarkerGroup={setNewMarkerGroup}
          areaOptions={areaOptions}
          newMarkerAreaTarget={newMarkerAreaTarget}
          onChangeNewMarkerAreaTarget={setNewMarkerAreaTarget}
          deleteGroupValue={deleteGroupValue}
          onChangeDeleteGroupValue={setDeleteGroupValue}
          onDeleteGroup={handleDeleteGroup}
          isDrawingZone={isDrawingZone}
          onToggleDrawingZone={handleToggleDrawingZone}
          zonePointsCount={zonePoints.length}
          onUndoZonePoint={handleUndoZonePoint}
          onFinishZone={handleFinishZone}
          selectedMarker={selectedMarker}
          selectedMarkerScope={selection?.scope ?? null}
          selectedMarkerAreaPositions={selectedMarkerAreaPositions}
          onChangeSelectedField={handleChangeSelectedField}
          onDeleteSelectedMarker={handleDeleteSelectedMarker}
          onMoveSelectedMarkerToArea={handleMoveSelectedMarkerToArea}
          onExportMarkers={handleExportMarkers}
          onExportAreas={handleExportAreas}
        />
      )}

      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds.pad(0.5)}
        minZoom={config.minZoom}
        maxZoom={config.maxZoom}
        zoom={config.minZoom}
        center={bounds.getCenter()}
        attributionControl={false}
        style={{ height: '100vh', width: '100%', background: '#1a1a1a' }}
        id="map"
      >
        <MapEventsHandler activeMap={activeMap} onHoverCoords={onHoverCoords} lastPointRef={lastHoverPointRef} />
        <ViewportTracker onBoundsChange={handleVisibleBoundsChange} />
        <MapBoundsController activeMap={activeMap} />
        <ViewportPersister activeMap={activeMap} />
        {isDev && <DevMapClickHandler activeMap={activeMap} onMapClick={handleDevMapClick} />}

        <TileLayer
          url={`${BASE_URL}/tiles/${activeMap}/{z}/{y}/{x}.webp`}
          tileSize={config.tileSize}
          noWrap={true}
          bounds={bounds}
          minZoom={config.minZoom}
          maxZoom={config.maxZoom}
        />

        {/* Области — между основной картой и зонами по z-index пейна (см. AreaOverlay).
            Показываем area смещённой под текущую выбранную позицию
            (getEffectiveAreaGeom) — сами x/y/маркеры в areas.json остаются
            "базовыми" (привязанными к area.positionId по умолчанию). Область
            больше не редактируется через UI — только позиция (см. AreaPositionMarker). */}
        {areas
          .map((area) => getEffectiveAreaGeom(area))
          .filter((area) => {
            if (!visibleBounds) return true;
            const b = L.latLngBounds(
              L.CRS.Simple.pointToLatLng(L.point(area.x, area.y + area.height), config.maxZoom),
              L.CRS.Simple.pointToLatLng(L.point(area.x + area.width, area.y), config.maxZoom)
            );
            return visibleBounds.intersects(b);
          }).map((area) => {
            const currentPositionId = areaPositionOverrides.get(area.id) ?? area.positionId;
            const confirmed = !!areaConfirmed.get(area.id);
            const rotation = getAreaRotation(area);
            const verified = getPositionVerified(area);
            const showPositionMarker = zonesVisible && area.positionId && area.positions && area.positions.length > 0 && currentPositionId;
            return (
              <React.Fragment key={area.id}>
                <AreaOverlay
                  area={area}
                  maxZoom={config.maxZoom}
                  activeFilters={activeFilters}
                  getIcon={createCustomIcon}
                  renderPopupContent={renderPopupContent}
                  isDev={isDev}
                  editMode={editMode}
                  selectedIdx={selection?.scope === 'area' && selection.areaId === area.id ? selection.idx : null}
                  onMarkerClick={(idx) => handleAreaMarkerClick(area.id, idx)}
                  onMarkerDragEnd={(idx, e) => handleAreaMarkerDragEnd(area.id, idx, e)}
                  rotation={rotation}
                  currentPositionId={currentPositionId ?? null}
                />
                {showPositionMarker && (
                  <AreaPositionMarker
                    areaId={area.id}
                    areaName={getAreaName(area.id)}
                    centerX={area.x + area.width / 2}
                    centerY={area.y + area.height / 2}
                    positions={area.positions!}
                    currentPositionId={currentPositionId!}
                    confirmed={confirmed}
                    maxZoom={config.maxZoom}
                    getPositionLabel={getPositionLabel}
                    positionOccupancy={positionOccupancy}
                    getAreaName={getAreaName}
                    onConfirm={handleConfirmAreaPosition}
                    onSwitch={handleSwitchAreaPosition}
                    rotation={rotation}
                    isDev={isDev}
                    onRotate={handleRotateArea}
                    onResetRotation={handleResetAreaRotation}
                    onSaveRotation={isDev ? handleSaveAreaRotation : undefined}
                    verified={verified}
                    onToggleVerified={isDev ? handleToggleAreaVerified : undefined}
                  />
                )}
                {isDev && editMode && (
                  <AreaDragHandle
                    areaId={area.id}
                    centerX={area.x + area.width / 2}
                    centerY={area.y + area.height / 2}
                    maxZoom={config.maxZoom}
                    onDragEnd={handleAreaDragEnd}
                  />
                )}
              </React.Fragment>
            );
          })}

        {zonesVisible && zonePolygons.map((z, idx) => {
          // Зона случайного спавна привязана к area (z.positionId === area.id) —
          // при клике на такую зону показываем тот же попап позиции, что и у
          // AreaPositionMarker (подтверждение/переключение), а не просто название.
          const linkedArea = z.positionId ? areas.find((a) => a.id === z.positionId) : undefined;
          const showAreaPopup = linkedArea && linkedArea.positionId && linkedArea.positions && linkedArea.positions.length > 0;
          const currentPositionId = linkedArea ? (areaPositionOverrides.get(linkedArea.id) ?? linkedArea.positionId) : undefined;

          return (
            <Polygon
              key={`zone-${idx}`}
              positions={z.positions}
              pathOptions={{
                color: z.color,
                weight: 3,
                fillOpacity: z.fillOpacity,
                dashArray: z.dashArray,
                className: 'map-zone',
              }}
            >
              {showAreaPopup && linkedArea && currentPositionId ? (
                <Popup minWidth={230}>
                  <AreaPositionPopupContent
                    areaId={linkedArea.id}
                    areaName={getAreaName(linkedArea.id)}
                    positions={linkedArea.positions!}
                    currentPositionId={currentPositionId}
                    confirmed={!!areaConfirmed.get(linkedArea.id)}
                    getPositionLabel={getPositionLabel}
                    positionOccupancy={positionOccupancy}
                    getAreaName={getAreaName}
                    onConfirm={handleConfirmAreaPosition}
                    onSwitch={handleSwitchAreaPosition}
                    rotation={getAreaRotation(linkedArea)}
                    isDev={isDev}
                    onRotate={handleRotateArea}
                    onResetRotation={handleResetAreaRotation}
                    onSaveRotation={isDev ? handleSaveAreaRotation : undefined}
                    verified={getPositionVerified(linkedArea)}
                    onToggleVerified={isDev ? handleToggleAreaVerified : undefined}
                  />
                </Popup>
              ) : (
                z.name && <Popup>{t(z.name as TranslationKey)}</Popup>
              )}
            </Polygon>
          );
        })}

        {isDev && zonePreviewPositions.length > 0 && (
          <Polyline positions={zonePreviewPositions} pathOptions={{ color: '#ff0000', weight: 2, dashArray: '5,5' }} />
        )}

        {filteredMarkers.map(({ m, i }) => (
          <MarkerItem
            key={`${m.x}-${m.y}-${i}`}
            marker={m}
            index={i}
            isSelected={isDev && selection?.scope === 'top' && selection.idx === i}
            isDev={isDev}
            editMode={editMode}
            maxZoom={config.maxZoom}
            getIcon={createCustomIcon}
            onMarkerClick={handleMarkerClick}
            onMarkerDragEnd={handleMarkerDragEnd}
            renderPopupContent={renderPopupContent}
          />
        ))}
      </MapContainer>
    </div>
  );
});

MapViewInnerComponent.displayName = 'MapViewInner';

// React.memo не даёт компоненту (и, следовательно, сотням маркеров внутри него)
// перерисовываться из-за не связанных с картой изменений состояния в родителе
// (например, движение мыши больше не проходит через React-состояние, но на
// всякий случай — сравнение пропсов защищает и от прочих поводов для ре-рендера).
export const MapViewInner = React.memo(MapViewInnerComponent);