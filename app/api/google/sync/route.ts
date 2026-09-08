import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  duplicateTemplateForProject,
  writeSheetData,
  isGoogleConfigured,
} from '@/lib/google';

// ============================================================================
// POST /api/google/sync
// Body: { projectId: string, projectName: string, month: number, year: number }
// Action:
//   1. Duplicate the master template spreadsheet → "{projectName} — {Month} {Year}"
//   2. Pull GC + SC data for the project's month/year from Supabase (service role)
//   3. Write the data into the duplicated spreadsheet's "Rooming List" sheet
//   4. Return { spreadsheetId, spreadsheetUrl }
// ============================================================================

// Helper: create a Supabase client with the service role key (bypasses RLS).
// We need this to read all cleaning records server-side.
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required for server-side data export.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  // 1. Validate Google env
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Google Service Account not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_TEMPLATE_SPREADSHEET_ID in Vercel env vars.',
      },
      { status: 500 }
    );
  }

  // 2. Parse body
  let body: { projectId?: string; projectName?: string; month?: number; year?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const { projectId, projectName, month, year } = body;
  if (!projectId || !projectName || !month || !year) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields: projectId, projectName, month, year' },
      { status: 400 }
    );
  }

  // 3. Duplicate the template
  const dupResult = await duplicateTemplateForProject(projectName, month, year);
  if (!dupResult.success || !dupResult.newSpreadsheetId || !dupResult.newSpreadsheetUrl) {
    return NextResponse.json(dupResult, { status: 500 });
  }

  // 4. Pull data from Supabase (service role)
  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e.message,
        spreadsheetId: dupResult.newSpreadsheetId,
        spreadsheetUrl: dupResult.newSpreadsheetUrl,
        warning: 'Template was duplicated but data could not be exported. Open the new sheet manually.',
      },
      { status: 500 }
    );
  }

  // 5. Fetch all rooms + GC records for the project's month/year
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const startDate = `${yearMonth}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const endDate = `${yearMonth}-${String(endDay).padStart(2, '0')}`;

  const [roomsRes, gcRes, scRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, room_number, section, floor, room_types(name)')
      .order('room_number', { ascending: true }),
    supabase
      .from('general_cleaning')
      .select('id, room_id, status, done_type, completed_at, date, profiles(name)')
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('special_checklists')
      .select('id, item_name, status, completed_at, profiles(name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);

  if (roomsRes.error || gcRes.error || scRes.error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch data from Supabase.',
        details: {
          rooms: roomsRes.error?.message,
          gc: gcRes.error?.message,
          sc: scRes.error?.message,
        },
        spreadsheetId: dupResult.newSpreadsheetId,
        spreadsheetUrl: dupResult.newSpreadsheetUrl,
      },
      { status: 500 }
    );
  }

  // 6. Build sheet rows matching the spreadsheet layout
  //    Section → Floor → Rooms (one row per room)
  //    Columns: Section | Floor | Room | Type | Status | Done By | Done Type | Date
  const rooms = roomsRes.data ?? [];
  const gcRecords = gcRes.data ?? [];

  // Group rooms by section → floor
  const grouped: Record<string, Record<number, any[]>> = {};
  rooms.forEach((r: any) => {
    const sec = r.section ?? 'Unassigned';
    const fl = r.floor ?? 0;
    if (!grouped[sec]) grouped[sec] = {};
    if (!grouped[sec][fl]) grouped[sec][fl] = [];
    grouped[sec][fl].push(r);
  });

  const rows: (string | number | null)[][] = [];
  rows.push(['Project', projectName]);
  rows.push(['Period', `${String(month).padStart(2, '0')}/${year}`]);
  rows.push(['Generated', new Date().toISOString()]);
  rows.push([]);
  rows.push([
    'Section',
    'Floor',
    'Room',
    'Type',
    'Status',
    'Done By',
    'Done Type',
    'Completed At',
    'Date',
  ]);

  Object.keys(grouped)
    .sort()
    .forEach((section) => {
      rows.push([`Section Gedung ${section}`]);
      Object.keys(grouped[section])
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((floor) => {
          rows.push(['', `FLOOR ${floor} ${section}`]);
          grouped[section][floor].forEach((room: any) => {
            // Find any done GC record for this room within the month
            const roomGc = gcRecords
              .filter((g: any) => g.room_id === room.id)
              .sort((a: any, b: any) =>
                String(a.completed_at).localeCompare(String(b.completed_at))
              );
            const lastDone = roomGc.find((g: any) => g.status === 'done');
            const typeName = Array.isArray(room.room_types)
              ? room.room_types[0]?.name ?? '—'
              : room.room_types?.name ?? '—';
            rows.push([
              section,
              floor,
              room.room_number,
              typeName,
              lastDone ? 'done' : 'pending',
              (lastDone?.profiles as any)?.name ?? '',
              lastDone?.done_type === 'housekeeping'
                ? 'Housekeeping'
                : lastDone?.done_type === 'engineering'
                ? 'Engineering'
                : '',
              lastDone?.completed_at
                ? new Date(lastDone.completed_at).toLocaleString('en-US')
                : '',
              lastDone?.date ?? '',
            ]);
          });
        });
    });

  // Append Special Cleaning checklist summary
  rows.push([]);
  rows.push(['Special Cleaning Checklist']);
  rows.push(['Item', 'Status', 'Done By', 'Completed At']);
  (scRes.data ?? []).forEach((item: any) => {
    rows.push([
      item.item_name,
      item.status,
      (item as any).profiles?.name ?? '',
      item.completed_at ? new Date(item.completed_at).toLocaleString('en-US') : '',
    ]);
  });

  // 7. Write to the new spreadsheet
  //    The template uses sheet name "Rooming List" — but we write to the FIRST sheet
  //    (sheetId 0) to be safe across different template configurations.
  const writeResult = await writeSheetData(
    dupResult.newSpreadsheetId,
    'Sheet1',
    rows
  );

  if (!writeResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: writeResult.error,
        spreadsheetId: dupResult.newSpreadsheetId,
        spreadsheetUrl: dupResult.newSpreadsheetUrl,
        warning:
          'Template was duplicated but data could not be written. Open the new sheet manually.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    spreadsheetId: dupResult.newSpreadsheetId,
    spreadsheetUrl: dupResult.newSpreadsheetUrl,
    rowsWritten: rows.length,
  });
}

export async function GET() {
  return NextResponse.json({
    configured: isGoogleConfigured(),
    message: isGoogleConfigured()
      ? 'Google Service Account is configured.'
      : 'Google Service Account is NOT configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_TEMPLATE_SPREADSHEET_ID to env vars.',
  });
}
