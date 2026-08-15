export type MapKey = 'swamp_forest' | 'wild_bogs';

export type GroupsKeys = 
  | 'start' | 'layer_zones' | 'zombie' | 'location' | 'boss' | 'fishing' 
  | 'box' | 'box_winch' | 'door_winch' | 'barrier' | 'box_pickup' | 'motorcycle' | 'airdrop' | 'c4' | 'axe' 
  | 'crowbar' | 'transistor' | 'shovel' | 'generator' | 'radio' 
  | 'motorcycle_repair' | 'gas_pump' | 'corpse_keys' | 'tripwire_trap' 
  | 'campfire' | 'canceling_alarm' | 'unique_resource';

export const ALL_GROUPS: GroupsKeys[] = [
	'layer_zones', 'start',
	//  'zombie', 'boss', 'fishing',
	 'box', 'box_winch', 'barrier', 'door_winch',
	  // 'box_pickup', 
  // 'motorcycle', 'airdrop', 
	'c4', 'axe', 'crowbar', 'transistor', 
  'shovel', 'generator', 'radio', 'motorcycle_repair', 'gas_pump', 
  'corpse_keys', 'tripwire_trap', 'campfire', 'canceling_alarm', 'unique_resource'
];

export type IconKeys = 
  | 'start' | 'boss' | 'boss_leshen' | 'boss_screech' | 'boss_wendigo' 
  | 'generator' | 'radio' | 'motorcycle' | 'motorcycle_repair' | 'gas_pump' 
  | 'corpse_keys' | 'crowbar' | 'axe' | 'shovel' | 'c4' | 'transistor' 
  | 'campfire' | 'box' | 'box_pickup' | 'airdrop' | 'fishing' 
  | 'tripwire_trap' | 'canceling_alarm' | 'point' | 'zombie' 
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
}

export interface ZonesJSON {
  name: string;
  color: string;
  coordinates: [number, number][];
	fillOpacity?: number;
	dashArray?: string;
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