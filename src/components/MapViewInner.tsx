'use client';

import { TranslationKey, useLanguage } from '@/context/LanguageContext'
import { ALL_GROUPS, GroupsKeys, IconKeys, IMapConfig, MapKey, MarkerJSON, ZonesJSON } from '@/lib/initial-data'
import L from 'leaflet'
// import 'leaflet/dist/leaflet.css'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DevToolsPanel } from './DevToolsPanel'

interface MapViewInnerProps {
  activeMap: MapKey;
  activeFilters: Set<GroupsKeys>;
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
  generator: ['use.png', 32],
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
}> = ({ activeMap, onHoverCoords }) => {
  const { t } = useLanguage()

  const map = useMapEvents({
    mousemove(e) {
      const config = MAP_CONFIG[activeMap];
      const point = map.project(e.latlng, config.maxZoom);
      const x = Math.round(point.x);
      const y = Math.round(point.y);

      if (x >= 0 && x <= config.width && y >= 0 && y <= config.height) {
        onHoverCoords(t('cursor_pos').replace('{x}', String(x)).replace('{y}', String(y)));
      } else {
        onHoverCoords(t('out_of_map'));
      }
    },
  });

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
    map.fitBounds(bounds);
  }, [activeMap, map]);

  return null;
};

// Ловит клики по карте в dev-режиме: добавление маркера, рисование зоны, снятие выделения.
const DevMapClickHandler: React.FC<{
  activeMap: MapKey;
  onMapClick: (x: number, y: number) => void;
}> = ({ activeMap, onMapClick }) => {
  const map = useMapEvents({
    click(e) {
      const config = MAP_CONFIG[activeMap];
      const point = map.project(e.latlng, config.maxZoom);
      onMapClick(Math.round(point.x), Math.round(point.y));
    },
  });

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

const MapViewInnerComponent = forwardRef<MapViewInnerHandle, MapViewInnerProps>(({
  activeMap,
  activeFilters,
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

  const config = MAP_CONFIG[activeMap];

  // Загружаем сохранённые статусы при смене карты
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`[${activeMap}]_marker_statuses`) || '[]') as [string, MarkerStatus][];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMarkerStatuses(new Map(saved));
    } catch {
      setMarkerStatuses(new Map());
    }
  }, [activeMap]);

  const handleToggleMarkerStatus = useCallback((x: number, y: number, status: MarkerStatus) => {
    const key = `${x}_${y}`;
    setMarkerStatuses((prev) => {
      const next = new Map(prev);
      // Повторный клик по тому же статусу — снимает отметку
      if (next.get(key) === status) {
        next.delete(key);
      } else {
        next.set(key, status);
      }
      localStorage.setItem(`[${activeMap}]_marker_statuses`, JSON.stringify(Array.from(next.entries())));
      return next;
    });
  }, [activeMap]);

  // Полный сброс всех отметок done/ignored для текущей карты (вызывается извне через ref)
  useImperativeHandle(ref, () => ({
    resetAllStatuses: () => {
      setMarkerStatuses(new Map());
      localStorage.setItem(`[${activeMap}]_marker_statuses`, JSON.stringify([]));
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

  // Кэш готовых L.divIcon по маркеру: пока "подпись" маркера (координаты,
  // группа/иконка, угол, статус, выделение, перевод) не изменилась — отдаём
  // тот же самый объект иконки, вместо того чтобы пересоздавать div/img на
  // каждый ре-рендер (это дорого при сотнях маркеров и вызывает лишние
  // marker.setIcon() внутри react-leaflet).
  const iconCacheRef = useRef<Map<string, { sig: string; icon: L.DivIcon }>>(new Map());

  const createCustomIcon = useCallback((m: MarkerJSON, isSelected: boolean = false): L.DivIcon => {
    const status = markerStatuses.get(`${m.x}_${m.y}`);
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
    const status = markerStatuses.get(`${m.x}_${m.y}`);
    const showStatusButtons = STATUS_TRACKED_GROUPS.has(m.group);

    return (
      <div className="popup-container-center">
        <b className="popup-main-title">{t(m.text as TranslationKey)}</b>

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
              <button className="map-btn" onClick={() => handleToggleMarkerStatus(m.x, m.y, 'done')}>
                {status === 'done' ? `↩ ${t('undo')}` : `✅ ${t('mark_done')}`}
              </button>
            )}
            {status !== 'done' && (
              <button className="map-btn" onClick={() => handleToggleMarkerStatus(m.x, m.y, 'ignored')}>
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
              alt="Loot"
              onClick={() => onImageClick(`${BASE_URL}/images/loot/${m.image}`)}
            />
          </div>
        )}
        {/* {m.crates && m.crates.length > 0 && (
          <div className="popup-loot-body">
            {m.crates.map((crateId) => {
              const crate = cratesData[crateId];
              if (!crate) return null;
              return (
                <div key={crateId}>
                  <div className="popup-section-title">{t(crate.name_key)}</div>
                  <ul className="popup-loot-list">
                    {crate.contents.map((item, index) => {
                      if (item.type === 'single') {
                        return (
                          <li key={index}>
                            • {t(item.item_key)} {item.count ? `: ${item.count}` : ''}
                          </li>
                        );
                      }
                      if (item.type === 'group') {
                        return (
                          <li key={index}>
                            • {t('one')} {t('of_the_following')}:
                            <ul className="popup-loot-sublist">
                              {item.items.map((subItem, subIndex) => (
                                <li key={subIndex}>• {t(subItem.item_key)}</li>
                              ))}
                            </ul>
                          </li>
                        );
                      }
                      return null;
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )} */}
      </div>
    );
  }, [markerStatuses, t, onImageClick, activeMap]);

  const filteredMarkers = useMemo(() => {
    return markers
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.group === 'location' || activeFilters.has(m.group));
  }, [markers, activeFilters]);

  const zonesVisible = activeFilters.has('layer_zones' as GroupsKeys);

  const zonePolygons = useMemo(() => {
    return zones.map((z) => ({
      positions: z.coordinates.map(([x, y]) => L.CRS.Simple.pointToLatLng(L.point(x, y), config.maxZoom)),
      color: z.color || '#3388ff',
      name: z.name,
      fillOpacity: z.fillOpacity ?? 0.2,
      dashArray: z.dashArray,
    }));
  }, [zones, config]);

  // Группы, реально встречающиеся в данных текущей карты (markers.json + zones.json),
  // в каноническом порядке ALL_GROUPS — чтобы фильтры не показывали пустые пункты.
  const availableGroups = useMemo(() => {
    const present = new Set<GroupsKeys>();
    markers.forEach((m) => {
      if (m.group !== 'location') present.add(m.group);
    });
    if (zones.length > 0) present.add('layer_zones' as GroupsKeys);
    return ALL_GROUPS.filter((g) => present.has(g));
  }, [markers, zones]);

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
    return counts;
  }, [markers, markerStatuses]);

  useEffect(() => {
    onGroupCounts?.(groupCounts);
  }, [groupCounts, onGroupCounts]);

  // --- DEV TOOLS ---
  const [isDev, setIsDev] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devParam = params.get('dev');
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDev(devParam === '1' || (isLocal && devParam !== '0'));
  }, []);

  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newMarkerGroup, setNewMarkerGroup] = useState<string>('start');
  const [deleteGroupValue, setDeleteGroupValue] = useState<string>('start');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<[number, number][]>([]);

  const selectedMarker = selectedIdx !== null ? markers[selectedIdx] ?? null : null;

  const handleDevMapClick = useCallback((x: number, y: number) => {
    if (isDrawingZone) {
      setZonePoints((prev) => [...prev, [x, y]]);
      return;
    }

    if (addMode) {
      const newMarker: MarkerJSON = {
        x,
        y,
        text: newMarkerGroup === 'location' ? 'loc_new' : `item_${newMarkerGroup}`,
        group: newMarkerGroup as GroupsKeys,
        angle: 0,
      };
      setMarkers((prev) => {
        setSelectedIdx(prev.length);
        return [...prev, newMarker];
      });
      return;
    }

    if (editMode) {
      setSelectedIdx(null);
    }
  }, [isDrawingZone, addMode, newMarkerGroup, editMode]);

  const handleMarkerClick = useCallback((idx: number) => {
    if (editMode) setSelectedIdx(idx);
  }, [editMode]);

  const handleMarkerDragEnd = useCallback((idx: number, e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const p = L.CRS.Simple.latLngToPoint(marker.getLatLng(), config.maxZoom);
    setMarkers((prev) => prev.map((m, i) => (i === idx ? { ...m, x: Math.round(p.x), y: Math.round(p.y) } : m)));
  }, [config]);

  const handleChangeSelectedField = useCallback((field: 'text' | 'group' | 'icon' | 'image' | 'angle', value: string | number) => {
    if (selectedIdx === null) return;
    setMarkers((prev) =>
      prev.map((m, i) => {
        if (i !== selectedIdx) return m;
        if (field === 'group') return { ...m, group: value as GroupsKeys };
        if (field === 'angle') return { ...m, angle: value as number };
        if (field === 'icon') return { ...m, icon: (value as IconKeys) || undefined };
        if (field === 'image') return { ...m, image: (value as string) || undefined };
        return { ...m, text: value as string };
      })
    );
  }, [selectedIdx]);

  const handleDeleteSelectedMarker = useCallback(() => {
    if (selectedIdx === null) return;
    setMarkers((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  }, [selectedIdx]);

  const handleDeleteGroup = useCallback(() => {
    if (!confirm(`Удалить все маркеры группы "${deleteGroupValue}"?`)) return;
    setMarkers((prev) => prev.filter((m) => m.group !== deleteGroupValue));
    setSelectedIdx(null);
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

  const handleToggleEditMode = useCallback((v: boolean) => {
    setEditMode(v);
    if (!v) setSelectedIdx(null);
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
          deleteGroupValue={deleteGroupValue}
          onChangeDeleteGroupValue={setDeleteGroupValue}
          onDeleteGroup={handleDeleteGroup}
          isDrawingZone={isDrawingZone}
          onToggleDrawingZone={handleToggleDrawingZone}
          zonePointsCount={zonePoints.length}
          onUndoZonePoint={handleUndoZonePoint}
          onFinishZone={handleFinishZone}
          selectedMarker={selectedMarker}
          onChangeSelectedField={handleChangeSelectedField}
          onDeleteSelectedMarker={handleDeleteSelectedMarker}
          onExportMarkers={handleExportMarkers}
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
        <MapEventsHandler activeMap={activeMap} onHoverCoords={onHoverCoords} />
        <MapBoundsController activeMap={activeMap} />
        {isDev && <DevMapClickHandler activeMap={activeMap} onMapClick={handleDevMapClick} />}

        <TileLayer
          url={`${BASE_URL}/tiles/${activeMap}/{z}/{y}/{x}.webp`}
          tileSize={config.tileSize}
          noWrap={true}
          bounds={bounds}
          minZoom={config.minZoom}
          maxZoom={config.maxZoom}
        />

        {zonesVisible && zonePolygons.map((z, idx) => (
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
            {z.name && <Popup>{t(z.name as TranslationKey)}</Popup>}
          </Polygon>
        ))}

        {isDev && zonePreviewPositions.length > 0 && (
          <Polyline positions={zonePreviewPositions} pathOptions={{ color: '#ff0000', weight: 2, dashArray: '5,5' }} />
        )}

        {filteredMarkers.map(({ m, i }) => (
          <MarkerItem
            key={`${m.x}-${m.y}-${i}`}
            marker={m}
            index={i}
            isSelected={isDev && selectedIdx === i}
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