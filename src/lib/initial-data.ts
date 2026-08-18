export type MapKey = 'swamp_forest' | 'wild_bogs';

// Префикс ключей localStorage. Сайт хостится на GitHub Pages, где localStorage
// общий на весь origin (username.github.io) — т.е. другой проект на том же
// аккаунте по другому пути мог бы случайно использовать такие же короткие
// ключи ('marker_statuses' и т.п.) и конфликтовать с этим сайтом. Префикс —
// ключ самого сайта (ldoe-bogs) — исключает такие коллизии.
export const STORAGE_PREFIX = 'ldoe-bogs';

export type GroupsKeys = 
  | 'start' | 'layer_zones' | 'zombie' | 'location' | 'boss' | 'fishing' 
  | 'box' | 'box_winch' | 'door_winch' | 'barrier' | 'box_pickup' | 'motorcycle' | 'airdrop' | 'c4' | 'axe' 
  | 'crowbar' | 'transistor' | 'corpse_keys' | 'unique_resource';

export const ALL_GROUPS: GroupsKeys[] = [
	'layer_zones', 'start', 'location',
	//  'zombie', 'boss', 'fishing',
	 'box', 'box_winch', 'barrier', 'door_winch',
	  // 'box_pickup', 
  // 'motorcycle', 'airdrop', 
	'c4', 'axe', 'crowbar', 'transistor', 
  'corpse_keys', 'unique_resource'
];

export type IconKeys = 
  | 'start' | 'boss' | 'boss_leshen' | 'boss_screech' | 'boss_wendigo' 
  | 'motorcycle'
  | 'corpse_keys' | 'crowbar' | 'axe' | 'c4' | 'transistor' 
  | 'box' | 'box_pickup' | 'airdrop' | 'fishing' 
  | 'point' | 'zombie' 
  | 'zombie_phantom' | 'zombie_fast_biter' | 'zombie_giant' 
  | 'zombie_boar' | 'zombie_bloater' | 'animal_north_deer';

export interface MarkerJSON {
  x: number;
  y: number;
  text: string;
  group: GroupsKeys;
  image?: string;
  angle?: number;
  icon?: IconKeys;
  crates?: string[];
  // Стабильный ключ для статуса "готово/не буду" (см. markerStatuses в MapViewInner),
  // не зависящий от x/y. Нужен маркерам внутри area: их x/y меняются при смене
  // предустановленной позиции area, а отметка done/ignored должна сохраняться.
  // Для обычных маркеров карты не задаётся — используется fallback "x_y".
  statusKey?: string;
  onlyAtPositionId?: string;
}

export interface ZonesJSON {
  name: string;
  color: string;
  coordinates: [number, number][];
	fillOpacity?: number;
	dashArray?: string;
	// Привязка полигона случайного спавна к конкретной area (см. MapAreaConfig.id).
	// Используется, чтобы: 1) красить зону красным/зелёным в зависимости от того,
	// подтверждено ли текущее положение этой area, и 2) сдвигать зону вместе с
	// area, когда игрок переключает её на другую предустановленную позицию.
	positionId?: string;
}

// Предустановленная позиция (одна из общих "точек" на карте, куда игра может
// случайно поместить область) в привязке к конкретной area: x/y — координаты
// верхнего левого угла area (x1/y1), если бы она была размещена в этой точке.
// Правый нижний угол (x2/y2) не хранится — считается прибавлением собственных
// width/height area (см. MapAreaConfig) к этим x/y. Хранится внутри
// MapAreaConfig.positions, отдельного positions.json больше нет — набор точек
// не общий, а свой у каждой area.
export interface AreaPositionOffset {
  id: string;
  x: number;
  y: number;
  // Поворот area (тайлов + её маркеров) на этой предустановленной позиции, в
  // градусах (0-360, по часовой стрелке). Это "базовый" поворот — как area
  // обычно повёрнута, когда игра размещает её именно в этой точке. Задаётся
  // в dev-режиме и сохраняется в areas.json (см. DevTools: "Сохранить поворот").
  // Игрок может дополнительно подстроить фактический поворот под то, что видит
  // у себя в игре — это отдельное состояние (areaRotationOverrides в
  // MapViewInner), хранится в localStorage и НЕ меняет это базовое значение.
  rotation?: number;
  // Помечает, что x/y (и rotation) этой конкретной позиции проверены дев-ом
  // и точно совпадают с тем, что реально в игре (не прикидка/на глаз).
  // Это свойство САМИХ ДАННЫХ позиции — хранится в areas.json и правится
  // только в dev-режиме (см. DevTools: попап позиции — "Пометить как
  // проверенные"). НЕ путать с areaConfirmed в MapViewInner — то отдельное
  // состояние конкретного игрока про то, что ТЕКУЩАЯ позиция area на его
  // карте совпадает с игрой, хранится в localStorage и не пишется в файл.
  // Позиция с verified: true защищена от случайной правки в dev-режиме —
  // перетаскивание (handleAreaDragEnd) и "Сохранить поворот как базовый"
  // (handleSaveAreaRotation) требуют явного подтверждения через confirm().
  verified?: boolean;
}

// Область поверх карты (например, интерьер локации) — рендерится как отдельный
// TileLayer, ограниченный прямоугольником [x,y]-[x+width,y+height] в тех же
// пиксельных координатах, что и markers.json/zones.json. Хранит свой набор маркеров.
export interface MapAreaConfig {
  id: string;
  tilePath: string; // напр. `/tiles/${activeMap}/area_${id}/{z}/{y}/{x}.webp`
  x: number;
  y: number;
  width: number;
  height: number;
  markers: MarkerJSON[];
	// Система предустановленных позиций (см. AreaPositionOffset выше):
	// positionId — на какую из точек (по id из массива positions) сейчас
	// "припаркована" область по умолчанию; positions — список всех точек,
	// доступных ЭТОЙ area (x/y = её собственные x1/y1 на этой точке, x2/y2
	// считаются добавлением width/height). Подтверждение (confirmed) и текущий
	// выбор (override) хранятся отдельно, в localStorage, а не в этом файле —
	// это состояние конкретного игрока/партии.
	positionId?: string;
	positions?: AreaPositionOffset[];
}

export interface CrateItem {
  item_key: string;
}

export interface CrateContentSingle {
  type: 'single';
  item_key: string;
  count?: string;
  note_key?: string;
}

export interface CrateContentGroup {
  type: 'group';
  pool_count: string;
  items: CrateItem[];
  note_key?: string;
}

export type CrateContent = CrateContentSingle | CrateContentGroup;

export interface CrateData {
  id: string;
  name_key: string;
  contents: CrateContent[];
}

export type CratesDataRegistry = { [crateId: string]: CrateData };

export interface IMapConfig {
  width: number;
  height: number;
  json: string;
  zonesJson: string;
  tilePath: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

export type MapConfigMap = {
  [key in MapKey]: IMapConfig;
};