export type UserRole = 'admin' | 'manager' | 'supervisor';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface RoomType {
  id: string;
  name: string;
  created_at: string;
}

export interface Room {
  id: string;
  room_number: string;
  room_type_id: string | null;
  section: string | null; // 'A' | 'C' | custom
  floor: number | null;   // 2 | 3 | 4 | 5
  created_at: string;
  room_types?: RoomType | null;
}

export type CleaningStatus = 'pending' | 'done' | 'issue';
export type DoneType = 'housekeeping' | 'engineering';

export interface InspectionArea {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

// General Cleaning — simplified: 1 record per room per day
// done_hk & done_eng are independent booleans (a room can be done by both HK and Eng)
export interface GeneralCleaning {
  id: string;
  room_id: string;
  status: CleaningStatus; // pending | done | issue (done = either HK or Eng true)
  done_hk: boolean;       // Housekeeping done?
  done_eng: boolean;      // Engineering done?
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  date: string;
  notes: string | null;
  rooms?: Room | null;
  profiles?: { name: string; email?: string } | null;
}

// Special Cleaning — per room per area per project (replaces 4-area model in GC)
export interface SpecialCleaning {
  id: string;
  project_id: string;
  room_id: string;
  area_id: string;
  status: CleaningStatus;
  done_type: DoneType | null;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  date: string;
  rooms?: Room | null;
  inspection_areas?: InspectionArea | null;
  profiles?: { name: string; email?: string } | null;
}

export interface SpecialProject {
  id: string;
  project_name: string;
  month: number;
  year: number;
  created_at: string;
}

export interface SpecialChecklist {
  id: string;
  project_id: string;
  item_name: string;
  status: 'pending' | 'done';
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  profiles?: { name: string; email?: string } | null;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Default inspection areas (matching the spreadsheet template)
// Used as fallback when DB inspection_areas table is empty
export const DEFAULT_INSPECTION_AREAS = [
  'Toilet Bowl',
  'Shower Glass',
  'Kettle Jug',
  'Scrubing Floor',
] as const;

// ============================================================================
// Inventory Equipment — matches the "Inventory Equipment TEMPLATE" sheet
// All numeric columns are nullable (NULL = empty cell, not 0)
// ============================================================================
export interface InventoryEquipment {
  id: string;
  no: number;
  item_name: string;
  previous_balance: number | null;
  new_purchase: number | null;
  condition_good: number | null;
  condition_broken: number | null;
  closing_inventory: number | null;
  need_to_purchase: number | null;
  price_per_unit: number | null;
  total_price: number | null; // computed: need_to_purchase * price_per_unit (NULL if either is NULL)
  created_at: string;
  updated_at: string;
  created_by: string | null;
  profiles?: { name: string } | null;
}

// ============================================================================
// Inventory Linen — matrix per item × location (room or storage)
// ============================================================================
export interface InventoryLinen {
  id: string;
  item_name: string;
  location: string; // room number (e.g. '301') or storage name (e.g. 'Linen Room', 'Gudang 3C')
  count: number;
  period_month: number;
  period_year: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  profiles?: { name: string } | null;
}

// Default linen items (matching the template's 16 rows)
export const DEFAULT_LINEN_ITEMS = [
  'Bath Towel',
  'Bath Mat',
  'Bed Sheet twin A',
  'Bed Sheet twin C',
  'Bed sheet Karet',
  'Bed Sheet King',
  'Pillow case',
  'Duvet Cover twin A',
  'Duvet Cover twin C',
  'Duvet Twin garis',
  'Duvet Cover King',
  'Bed Pad twin',
  'Bed Pad King',
  'Duvet Insert twin',
  'Duvet Insert King',
  'Hand towel',
] as const;

// Default storage locations (Block 1 of the template — only LINEN ROOM exists in sheet)
// Other storages (Gudang 3C, 5C, 4A, Office, OOO) are kept for UI flexibility
// but won't sync to sheet unless user adds columns to Block 1
export const DEFAULT_LINEN_STORAGES = [
  'Linen Room',
  'Gudang 3C',
  'Gudang 5C',
  'Gudang 4A',
  'Office',
  'OOO',
] as const;

// Room groups (Blocks 2-9 of the template)
// Block 4 = Section C Floor 4: rooms 412-424 (13 rooms)
export const LINEN_ROOM_GROUPS: { label: string; rooms: string[] }[] = [
  { label: 'Section C Floor 2', rooms: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213'] },
  { label: 'Section C Floor 3', rooms: ['312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323', '324'] },
  { label: 'Section C Floor 4', rooms: ['412', '413', '414', '415', '416', '417', '418', '419', '420', '421', '422', '423', '424'] },
  { label: 'Section C Floor 5', rooms: ['508', '509', '510', '511', '512', '513', '514', '515', '516', '517', '518', '519', '520'] },
  { label: 'Section A Floor 3', rooms: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311'] },
  { label: 'Section A Floor 4', rooms: ['401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411'] },
  { label: 'Section A Floor 5', rooms: ['501', '502', '503', '504', '505', '506', '507'] },
];

// ============================================================================
// Inventory Aset Room — matrix per item × room/storage (similar to Linen)
// ============================================================================
export interface InventoryAsetRoom {
  id: string;
  item_name: string;
  location: string; // room number (e.g. '301') or storage name (e.g. 'ROOM', 'Gudang 3C')
  count: number | null;
  period_month: number;
  period_year: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  profiles?: { name: string } | null;
}

// Default Aset Room items (21 items matching template rows 6-26)
export const DEFAULT_ASET_ROOM_ITEMS = [
  'Television',
  'Air conditioner',
  'Remote TV & AC',
  'Telephone',
  'Standing lamp',
  'Bed Side Lamp',
  'Hanger',
  'Box Tissue',
  'Dust Bin',
  'Kettle jug',
  'Cofee tray',
  'Coffe Set Holder',
  'MUG',
  'Sofa',
  'Dressing chair',
  'AKRILIC TV',
  'Amenities Tray',
  'Tumbler glass',
  'Soap dispenser',
  'Tissue Holder',
] as const;

// Default Aset Room storage locations (Block 1 of Aset Room template)
export const DEFAULT_ASET_STORAGES = [
  'ROOM',
  'Gudang 3C',
  'Gudang 5C',
  'Gudang 4A',
  'Office',
  'OOO',
] as const;

// Reuse LINEN_ROOM_GROUPS for Aset Room (same room structure)

// ============================================================================
// Inventory Aset Area — area items × area locations (separate module)
// ============================================================================
export interface InventoryAsetArea {
  id: string;
  item_name: string;
  location: string; // area name (e.g. 'Floor 4', 'Lobby area', 'Restaurant')
  count: number | null;
  period_month: number;
  period_year: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  profiles?: { name: string } | null;
}

// Default Aset Area items (27 items matching "Inventory Aset Area TEMPLATE" sheet)
export const DEFAULT_ASET_AREA_ITEMS = [
  'dusbin restroom',
  'dispenser shoap',
  'Hand Drayer',
  'tisu box',
  'tanaman restroom',
  'tanaman sintetis gd a',
  'tanaman sintetis gd c',
  'dusbin coridor c',
  'dusbin coridor a',
  'dusbin area',
  'rubbermate area',
  'meja konsole lobby',
  'meja konsole gd c',
  'meja konsole gd a',
  'rubbermate alrestroom area',
  'tanaman pembatas lobby',
  'tanaman pembatas santan',
  'sofa ballroom',
  'tanaman area sakeca',
  'tanaman area lobby',
  'tanaman meja sakeca',
  'tanaman coridor c',
  'tanaman coridor a',
  'tanaman santan and foye',
  'tanaman meja kecil santan',
  'goong lobby',
  'selang air',
] as const;

// Default Aset Area locations (25 locations matching "Inventory Aset Area TEMPLATE" sheet)
export const DEFAULT_ASET_AREA_LOCATIONS = [
  'Loby',
  'Restroom Loby',
  'restroom santan',
  'restroom ballrom',
  'tanaman sintetis gd a',
  'tanaman sintetis gd c',
  'dusbin coridor gd a',
  'dusbin coridor c',
  'rubbermate area',
  'meja konsole lobby',
  'meja konsole gd a',
  'meja konsole gd c',
  'rubbermate alrestroom',
  'tanaman pembatas lobby',
  'tanaman pembatas santan',
  'sofa ballrom',
  'tanaman area sakeca',
  'tanaman area lobby',
  'tanaman meja sakeca',
  'tanaman akses gd c',
  'tanaman coridor c',
  'tanaman coridor a',
  'tanaman kecil meja santan',
  'tanaman santan,foye',
  'dusbin area',
] as const;

// ============================================================================
// Inventory Pillow Protector — 1 row per room per period
// Tracks cleaning status of pillow protectors (Date / Status / Done by)
// ============================================================================
export interface InventoryPillowProtector {
  id: string;
  room_id: string;
  status: 'pending' | 'done' | 'issue';
  done_by: string | null;
  done_at: string | null;
  notes: string | null;
  period_month: number;
  period_year: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  rooms?: Room | null;
  profiles?: { name: string } | null;
  remarks?: string | null;
}
