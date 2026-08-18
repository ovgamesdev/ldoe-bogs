'use client';

import { GroupsKeys } from '@/lib/initial-data'
import React, { useState } from 'react'

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  zIndex: 1000,
  width: 230,
  maxHeight: 'calc(100vh - 20px)',
  overflowY: 'auto',
  background: 'rgba(30,30,30,0.95)',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: 6,
  padding: 10,
  fontSize: 12,
  fontFamily: 'monospace',
};

const btnStyle: React.CSSProperties = {
  width: '100%',
  background: '#333',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 4,
  padding: '6px',
  marginBottom: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: 120,
  background: '#222',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 4px',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#222',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '4px',
  marginBottom: 6,
};

interface SelectedMarkerData {
  x: number;
  y: number;
  text: string;
  group: GroupsKeys;
  icon?: string;
  image?: string;
  angle?: number;
  // Если задано — маркер виден только когда его area стоит на этой позиции
  // (см. MapAreaConfig.positions). Актуально только для маркеров внутри area.
  onlyAtPositionId?: string;
}

interface DevToolsPanelProps {
  groupOptions: string[];

  editMode: boolean;
  onToggleEditMode: (v: boolean) => void;

  addMode: boolean;
  onToggleAddMode: (v: boolean) => void;
  newMarkerGroup: string;
  onChangeNewMarkerGroup: (v: string) => void;

  // Куда добавлять новые маркеры (addMode) и куда переносить выделенный
  // маркер верхнего уровня: '' — обычные markers.json карты, иначе — id area.
  areaOptions: { id: string; label: string }[];
  newMarkerAreaTarget: string;
  onChangeNewMarkerAreaTarget: (v: string) => void;

  deleteGroupValue: string;
  onChangeDeleteGroupValue: (v: string) => void;
  onDeleteGroup: () => void;

  isDrawingZone: boolean;
  onToggleDrawingZone: () => void;
  zonePointsCount: number;
  onUndoZonePoint: () => void;
  onFinishZone: () => void;

  selectedMarker: SelectedMarkerData | null;
  // 'top' — маркер из markers.json карты, 'area' — маркер внутри area.
  // Кнопка "Переместить в область" показывается только для 'top'.
  selectedMarkerScope: 'top' | 'area' | null;
  // Позиции area, которой принадлежит выделенный маркер (пусто для scope
  // 'top' или если у area нет предустановленных позиций) — для селекта
  // "Показывать только на позиции".
  selectedMarkerAreaPositions: { id: string; label: string }[];
  onChangeSelectedField: (field: 'text' | 'group' | 'icon' | 'image' | 'angle' | 'onlyAtPositionId', value: string | number) => void;
  onDeleteSelectedMarker: () => void;
  onMoveSelectedMarkerToArea: () => void;

  onExportMarkers: () => void;
  onExportAreas: () => void;
}

const FlashButton: React.FC<{ onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }> = ({ onClick, children, style }) => {
  const [flashed, setFlashed] = useState(false);
  return (
    <button
      style={{ ...btnStyle, background: flashed ? '#2e7d32' : '#2196F3', ...style }}
      onClick={() => {
        onClick();
        setFlashed(true);
        setTimeout(() => setFlashed(false), 1200);
      }}
    >
      {flashed ? '✅ Скопировано!' : children}
    </button>
  );
};

const DevToolsPanelComponent: React.FC<DevToolsPanelProps> = ({
  groupOptions,
  editMode,
  onToggleEditMode,
  addMode,
  onToggleAddMode,
  newMarkerGroup,
  onChangeNewMarkerGroup,
  areaOptions,
  newMarkerAreaTarget,
  onChangeNewMarkerAreaTarget,
  deleteGroupValue,
  onChangeDeleteGroupValue,
  onDeleteGroup,
  isDrawingZone,
  onToggleDrawingZone,
  zonePointsCount,
  onUndoZonePoint,
  onFinishZone,
  selectedMarker,
  selectedMarkerScope,
  selectedMarkerAreaPositions,
  onChangeSelectedField,
  onDeleteSelectedMarker,
  onMoveSelectedMarkerToArea,
  onExportMarkers,
  onExportAreas,
}) => {
  return (
    <div style={panelStyle}>
      <div style={{ textAlign: 'center', marginBottom: 5, fontWeight: 'bold', color: '#4CAF50' }}>
        Dev: Zone Builder
      </div>
      <button style={{ ...btnStyle, background: isDrawingZone ? '#c62828' : '#333' }} onClick={onToggleDrawingZone}>
        {isDrawingZone ? '⏹ Стоп записи' : '▶ Начать зону'}
      </button>
      <button style={btnStyle} disabled={zonePointsCount === 0} onClick={onUndoZonePoint}>
        ↩ Отменить точку
      </button>
      <FlashButton onClick={onFinishZone} style={zonePointsCount < 3 ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
        💾 Копировать JSON зоны
      </FlashButton>
      <div style={{ textAlign: 'center', color: '#999', marginBottom: 8 }}>Points: {zonePointsCount}</div>

      <hr style={{ border: 0, borderTop: '1px solid #555', margin: '10px 0' }} />

      <div style={{ textAlign: 'center', marginBottom: 5, fontWeight: 'bold', color: '#2196F3' }}>
        Dev: Marker Editor
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#333', padding: 5, borderRadius: 4, marginBottom: 8 }} title="Также включает синий ✥-хэндл для перетаскивания самих areas (двигает их текущую позицию)">
        <input type="checkbox" checked={editMode} onChange={(e) => onToggleEditMode(e.target.checked)} />
        <span>Enable Edit &amp; Dragging</span>
      </label>

      <div style={{ background: '#333', padding: 6, borderRadius: 4, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={addMode} onChange={(e) => onToggleAddMode(e.target.checked)} />
          <span>Click map to Add</span>
        </label>
        <select style={selectStyle} value={newMarkerGroup} onChange={(e) => onChangeNewMarkerGroup(e.target.value)}>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value="location">📍 Location Text</option>
        </select>
        {areaOptions.length > 0 && (
          <select
            style={{ ...selectStyle, marginBottom: 0 }}
            value={newMarkerAreaTarget}
            onChange={(e) => onChangeNewMarkerAreaTarget(e.target.value)}
            title="Куда добавлять новые маркеры / куда переносить выделенный"
          >
            <option value="">📍 markers.json (карта)</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>🏠 {a.label}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ background: '#333', padding: 6, borderRadius: 4, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <select style={selectStyle} value={deleteGroupValue} onChange={(e) => onChangeDeleteGroupValue(e.target.value)}>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button style={{ ...btnStyle, background: '#c62828', marginBottom: 0 }} onClick={onDeleteGroup}>
          🗑️ Удалить группу
        </button>
      </div>

      {selectedMarker && (
        <div style={{ background: '#444', padding: 8, borderRadius: 4, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '3px solid #f44336' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ddd', fontWeight: 'bold' }}>
            <span>Marker {selectedMarkerScope === 'area' ? '🏠' : '📍'}</span>
            <span style={{ color: '#aaa' }}>X: {selectedMarker.x}, Y: {selectedMarker.y}</span>
          </div>

          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Text:
            <input
              style={inputStyle}
              type="text"
              value={selectedMarker.text}
              onChange={(e) => onChangeSelectedField('text', e.target.value)}
            />
          </label>

          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Group:
            <select
              style={{ ...inputStyle, padding: '2px' }}
              value={selectedMarker.group}
              onChange={(e) => onChangeSelectedField('group', e.target.value)}
            >
              {groupOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="location">location</option>
            </select>
          </label>

          {selectedMarker.group !== 'location' && (
            <>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Icon:
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="default"
                  value={selectedMarker.icon || ''}
                  onChange={(e) => onChangeSelectedField('icon', e.target.value)}
                />
              </label>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Image:
                <input
                  style={inputStyle}
                  type="text"
                  value={selectedMarker.image || ''}
                  onChange={(e) => onChangeSelectedField('image', e.target.value)}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Angle: <span style={{ color: '#ff9800', fontWeight: 'bold' }}>{selectedMarker.angle || 0}</span>°
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={selectedMarker.angle || 0}
                  style={{ width: '100%' }}
                  onChange={(e) => onChangeSelectedField('angle', Number(e.target.value))}
                />
              </label>
            </>
          )}

          {selectedMarkerScope === 'area' && selectedMarkerAreaPositions.length > 0 && (
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title="Маркер будет виден только когда area стоит на выбранной позиции">
              Только на позиции:
              <select
                style={{ ...inputStyle, padding: '2px' }}
                value={selectedMarker.onlyAtPositionId || ''}
                onChange={(e) => onChangeSelectedField('onlyAtPositionId', e.target.value)}
              >
                <option value="">🌐 Все позиции</option>
                {selectedMarkerAreaPositions.map((p) => (
                  <option key={p.id} value={p.id}>📍 {p.label}</option>
                ))}
              </select>
            </label>
          )}

          {selectedMarkerScope === 'top' && areaOptions.length > 0 && (
            <button
              style={{ ...btnStyle, background: '#6a1b9a', marginBottom: 0, opacity: newMarkerAreaTarget ? 1 : 0.5, pointerEvents: newMarkerAreaTarget ? 'auto' : 'none' }}
              onClick={onMoveSelectedMarkerToArea}
              title="Переносит маркер из markers.json в markers выбранной area (см. селект выше)"
            >
              ➡️ В область
            </button>
          )}

          <button style={{ ...btnStyle, background: '#c62828', marginBottom: 0 }} onClick={onDeleteSelectedMarker}>
            🗑️ Удалить маркер
          </button>
        </div>
      )}

      <FlashButton onClick={onExportMarkers}>
        💾 Экспорт всех маркеров
      </FlashButton>
      {areaOptions.length > 0 && (
        <FlashButton onClick={onExportAreas}>
          💾 Экспорт areas.json
        </FlashButton>
      )}
    </div>
  );
};

// Мемоизация: панель дев-тулзов рендерится только в dev-режиме, но всё равно
// не должна перестраиваться на каждый ре-рендер карты (движение мыши и т.п.).
export const DevToolsPanel = React.memo(DevToolsPanelComponent);