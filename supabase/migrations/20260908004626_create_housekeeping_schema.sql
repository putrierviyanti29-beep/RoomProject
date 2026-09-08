/*
# Hotel Housekeeping Management Schema

## Overview
Creates the complete database schema for the Hotel Housekeeping Daily Project Management System.
This system tracks General Cleaning (per-room) and Special Cleaning (monthly themed projects).

## Tables

### 1. profiles
Extends Supabase auth.users with role information.
- id (uuid, FK to auth.users) — primary key
- name (text) — display name
- role (text) — 'admin' | 'manager' | 'supervisor'
- created_at (timestamptz)

### 2. room_types
Master data for room categories.
- id (uuid, PK)
- name (text) — e.g. "Deluxe", "Suite"
- created_at (timestamptz)

### 3. rooms
Individual room records.
- id (uuid, PK)
- room_number (text, unique) — e.g. "101"
- room_type_id (uuid, FK to room_types)
- created_at (timestamptz)

### 4. general_cleaning
Daily general cleaning records per room.
- id (uuid, PK)
- room_id (uuid, FK to rooms)
- status (text) — 'pending' | 'done'
- completed_by (uuid, FK to auth.users, nullable)
- completed_at (timestamptz, nullable)
- created_at (timestamptz)
- date (date) — the cleaning date

### 5. special_projects
Monthly special cleaning projects with a theme.
- id (uuid, PK)
- project_name (text) — e.g. "Deep Cleaning Bathroom"
- month (int) — 1-12
- year (int)
- created_at (timestamptz)

### 6. special_checklists
Checklist items within a special project.
- id (uuid, PK)
- project_id (uuid, FK to special_projects)
- item_name (text)
- status (text) — 'pending' | 'done'
- completed_by (uuid, FK to auth.users, nullable)
- completed_at (timestamptz, nullable)
- created_at (timestamptz)

## Security
- RLS enabled on all tables.
- All authenticated users can read all data (shared operational data).
- Insert/update permissions scoped to authenticated users.
- profiles table: users can read all profiles, update only their own.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'supervisor' CHECK (role IN ('admin', 'manager', 'supervisor')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_types_select" ON room_types;
CREATE POLICY "room_types_select" ON room_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "room_types_insert" ON room_types;
CREATE POLICY "room_types_insert" ON room_types FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "room_types_update" ON room_types;
CREATE POLICY "room_types_update" ON room_types FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "room_types_delete" ON room_types;
CREATE POLICY "room_types_delete" ON room_types FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number text NOT NULL UNIQUE,
  room_type_id uuid REFERENCES room_types(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select" ON rooms;
CREATE POLICY "rooms_select" ON rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rooms_insert" ON rooms;
CREATE POLICY "rooms_insert" ON rooms FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rooms_update" ON rooms;
CREATE POLICY "rooms_update" ON rooms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rooms_delete" ON rooms;
CREATE POLICY "rooms_delete" ON rooms FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS general_cleaning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE general_cleaning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_select" ON general_cleaning;
CREATE POLICY "gc_select" ON general_cleaning FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "gc_insert" ON general_cleaning;
CREATE POLICY "gc_insert" ON general_cleaning FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "gc_update" ON general_cleaning;
CREATE POLICY "gc_update" ON general_cleaning FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gc_delete" ON general_cleaning;
CREATE POLICY "gc_delete" ON general_cleaning FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS special_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE special_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_select" ON special_projects;
CREATE POLICY "sp_select" ON special_projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "sp_insert" ON special_projects;
CREATE POLICY "sp_insert" ON special_projects FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sp_update" ON special_projects;
CREATE POLICY "sp_update" ON special_projects FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sp_delete" ON special_projects;
CREATE POLICY "sp_delete" ON special_projects FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS special_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES special_projects(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE special_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select" ON special_checklists;
CREATE POLICY "sc_select" ON special_checklists FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "sc_insert" ON special_checklists;
CREATE POLICY "sc_insert" ON special_checklists FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sc_update" ON special_checklists;
CREATE POLICY "sc_update" ON special_checklists FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sc_delete" ON special_checklists;
CREATE POLICY "sc_delete" ON special_checklists FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_general_cleaning_date ON general_cleaning(date);
CREATE INDEX IF NOT EXISTS idx_general_cleaning_room_id ON general_cleaning(room_id);
CREATE INDEX IF NOT EXISTS idx_special_checklists_project_id ON special_checklists(project_id);
CREATE INDEX IF NOT EXISTS idx_special_projects_month_year ON special_projects(month, year);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);