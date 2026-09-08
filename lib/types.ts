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
  created_at: string;
  room_types?: RoomType | null;
}

export interface GeneralCleaning {
  id: string;
  room_id: string;
  status: 'pending' | 'done';
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  date: string;
  rooms?: Room | null;
  profiles?: { name: string; email: string } | null;
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
  profiles?: { name: string; email: string } | null;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
