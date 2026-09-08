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

// General Cleaning — simplified: 1 record per room per day, with done_type
export interface GeneralCleaning {
  id: string;
  room_id: string;
  status: CleaningStatus;
  done_type: DoneType | null; // null when status !== 'done'
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
