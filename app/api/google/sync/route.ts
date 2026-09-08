import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  duplicateTemplateForProject,
  isGoogleConfigured,
  syncDataToTemplate,
  syncGeneralCleaningToTemplate,
  duplicateTemplateForCurrentMonth,
  syncEquipmentToSheet,
  syncInventoryLinenToSheet,
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
    // Get more specific error info
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID;

    let missingHint = '';
    if (!email) missingHint += ' GOOGLE_SERVICE_ACCOUNT_EMAIL is missing.';
    if (!key) missingHint += ' GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is missing.';
    if (!sheetId) missingHint += ' GOOGLE_TEMPLATE_SPREADSHEET_ID is missing.';

    // If key is present but doesn't start with PEM header (after normalization)
    if (key && email && sheetId) {
      let normalized = key.trim();
      if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
          (normalized.startsWith("'") && normalized.endsWith("'"))) {
        normalized = normalized.slice(1, -1).trim();
      }
      normalized = normalized.replace(/\\n/g, '\n');
      if (!normalized.startsWith('-----BEGIN')) {
        missingHint += ` Private key does not start with "-----BEGIN" after normalization. First 30 chars: "${normalized.substring(0, 30)}". Make sure you copied the ENTIRE private_key value from the JSON file, including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- markers.`;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: `Google Service Account not configured properly.${missingHint}`,
      },
      { status: 500 }
    );
  }

  // 2. Parse body
  let body: {
    projectId?: string;
    projectName?: string;
    month?: number;
    year?: number;
    mode?: 'duplicate' | 'write'; // default: 'write' (avoids Drive quota issues)
    targetSpreadsheetId?: string; // for 'write' mode — defaults to template ID
    type?: 'sc' | 'gc' | 'equipment' | 'linen';
    date?: string; // for 'gc' mode — YYYY-MM-DD, defaults to today
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const {
    projectId,
    projectName,
    month,
    year,
    mode = 'write', // default: write directly to template (no duplication)
    targetSpreadsheetId,
    type = 'sc', // default: special cleaning
    date,
  } = body;
  if (!projectId || !projectName || !month || !year) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields: projectId, projectName, month, year' },
      { status: 400 }
    );
  }

  // 3. Determine target spreadsheet
  let targetSheetId: string;
  let targetSheetUrl: string;
  if (mode === 'duplicate') {
    const dupResult = await duplicateTemplateForProject(projectName, month, year);
    if (!dupResult.success || !dupResult.newSpreadsheetId || !dupResult.newSpreadsheetUrl) {
      return NextResponse.json(dupResult, { status: 500 });
    }
    targetSheetId = dupResult.newSpreadsheetId;
    targetSheetUrl = dupResult.newSpreadsheetUrl;
  } else {
    // Write mode: use provided targetSpreadsheetId, or fall back to the template ID
    targetSheetId = targetSpreadsheetId || process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID!;
    targetSheetUrl = `https://docs.google.com/spreadsheets/d/${targetSheetId}/edit`;
  }

  // 3.5. Auto-duplicate templates into monthly sheets ("{Month} {Year} - SC" and " - GC")
  //      This ensures fresh sheets exist for the current month.
  //      Idempotent — if sheets already exist, returns their names.
  //      SC sync writes to scSheetName, GC sync writes to gcSheetName.
  const monthlyDup = await duplicateTemplateForCurrentMonth({ spreadsheetId: targetSheetId });
  if (!monthlyDup.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to create monthly sheets: ${monthlyDup.error}`,
        hint: 'Verify that the template sheets are named "Special Cleaning TEMPLATE" and "Ganeral Cleaning TEMPLATE" (or similar) in your spreadsheet.',
        spreadsheetId: targetSheetId,
        spreadsheetUrl: targetSheetUrl,
      },
      { status: 500 }
    );
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
        spreadsheetId: targetSheetId,
        spreadsheetUrl: targetSheetUrl,
        warning: 'Spreadsheet ready but data could not be exported. Open the sheet manually.',
      },
      { status: 500 }
    );
  }

  // 5. Branch based on type: 'sc' (Special Cleaning) or 'gc' (General Cleaning)
  if (type === 'gc') {
    // === GENERAL CLEANING SYNC ===
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [roomsRes, gcRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, room_number')
        .order('room_number', { ascending: true }),
      supabase
        .from('general_cleaning')
        .select('id, room_id, done_hk, done_eng, completed_at, date, profiles(name)')
        .eq('date', targetDate),
    ]);

    if (roomsRes.error || gcRes.error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch GC data from Supabase.',
          details: {
            rooms: roomsRes.error?.message,
            gc: gcRes.error?.message,
          },
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
        },
        { status: 500 }
      );
    }

    const rooms = (roomsRes.data ?? []) as { id: string; room_number: string }[];
    const gcRecords = (gcRes.data ?? []) as unknown as {
      room_id: string;
      done_hk: boolean;
      done_eng: boolean;
      completed_at: string | null;
      profiles: { name: string } | null;
    }[];

    const syncResult = await syncGeneralCleaningToTemplate({
      spreadsheetId: targetSheetId,
      date: targetDate,
      rooms,
      gcRecords,
      targetSheetName: monthlyDup.gcSheetName,
    });

    if (!syncResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: syncResult.error,
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
          warning: 'Spreadsheet accessible but GC data could not be written. Check error message.',
        },
        { status: 500 }
      );
    }

    const totalRooms = rooms.length;
    const doneHK = gcRecords.filter((g) => g.done_hk).length;
    const doneENG = gcRecords.filter((g) => g.done_eng).length;

    return NextResponse.json({
      success: true,
      spreadsheetId: targetSheetId,
      spreadsheetUrl: targetSheetUrl,
      roomsWritten: totalRooms,
      doneHK,
      doneENG,
      type: 'gc',
      date: targetDate,
      mode,
    });
  }

  // === EQUIPMENT INVENTORY SYNC ===
  if (type === 'equipment') {
    const { data: equipData, error: equipErr } = await supabase
      .from('inventory_equipment')
      .select('no, item_name, previous_balance, new_purchase, condition_good, condition_broken, closing_inventory, need_to_purchase, price_per_unit')
      .order('no', { ascending: true });

    if (equipErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch equipment data: ${equipErr.message}`,
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
        },
        { status: 500 }
      );
    }

    const equipment = (equipData ?? []) as Array<{
      no: number;
      item_name: string;
      previous_balance: number;
      new_purchase: number;
      condition_good: number;
      condition_broken: number;
      closing_inventory: number;
      need_to_purchase: number;
      price_per_unit: number;
    }>;

    const syncResult = await syncEquipmentToSheet({
      spreadsheetId: targetSheetId,
      targetSheetName: monthlyDup.equipmentSheetName,
      equipment,
      date: new Date().toISOString().split('T')[0],
    });

    if (!syncResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: syncResult.error,
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
          warning: 'Spreadsheet accessible but equipment data could not be written.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      spreadsheetId: targetSheetId,
      spreadsheetUrl: targetSheetUrl,
      sheetName: monthlyDup.equipmentSheetName,
      itemsWritten: equipment.length,
      type: 'equipment',
      mode,
    });
  }

  // === INVENTORY LINEN SYNC ===
  if (type === 'linen') {
    const { data: linenData, error: linenErr } = await supabase
      .from('inventory_linen')
      .select('item_name, location, count')
      .order('item_name', { ascending: true });

    if (linenErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch linen data: ${linenErr.message}`,
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
        },
        { status: 500 }
      );
    }

    const linenRecords = (linenData ?? []) as Array<{
      item_name: string;
      location: string;
      count: number;
    }>;

    const syncResult = await syncInventoryLinenToSheet({
      spreadsheetId: targetSheetId,
      targetSheetName: monthlyDup.linenSheetName,
      records: linenRecords,
    });

    if (!syncResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: syncResult.error,
          spreadsheetId: targetSheetId,
          spreadsheetUrl: targetSheetUrl,
          warning: 'Spreadsheet accessible but linen data could not be written.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      spreadsheetId: targetSheetId,
      spreadsheetUrl: targetSheetUrl,
      sheetName: monthlyDup.linenSheetName,
      cellsWritten: syncResult.cellsWritten ?? 0,
      type: 'linen',
      mode,
    });
  }

  // === SPECIAL CLEANING SYNC (default) ===
  const [roomsRes, scRes, areasRes] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, room_number')
      .order('room_number', { ascending: true }),
    supabase
      .from('special_cleaning')
      .select('id, room_id, area_id, status, completed_at, profiles(name)')
      .eq('project_id', projectId),
    supabase
      .from('inspection_areas')
      .select('id, name')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  if (roomsRes.error || scRes.error || areasRes.error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch data from Supabase.',
        details: {
          rooms: roomsRes.error?.message,
          sc: scRes.error?.message,
          areas: areasRes.error?.message,
        },
        spreadsheetId: targetSheetId,
        spreadsheetUrl: targetSheetUrl,
      },
      { status: 500 }
    );
  }

  const rooms = (roomsRes.data ?? []) as { id: string; room_number: string }[];
  const specialCleaning = (scRes.data ?? []) as unknown as {
    room_id: string;
    area_id: string;
    status: string;
    completed_at: string | null;
    profiles: { name: string } | null;
  }[];
  const inspectionAreas = (areasRes.data ?? []) as { id: string; name: string }[];

  // 6. Sync data into the existing template structure (preserves layout!)
  const syncResult = await syncDataToTemplate({
    spreadsheetId: targetSheetId,
    rooms,
    specialCleaning,
    inspectionAreas,
    targetSheetName: monthlyDup.scSheetName,
  });

  if (!syncResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: syncResult.error,
        spreadsheetId: targetSheetId,
        spreadsheetUrl: targetSheetUrl,
        warning:
          'Spreadsheet accessible but data could not be written to template cells. Check error message.',
      },
      { status: 500 }
    );
  }

  // Compute stats for the response
  const totalRooms = rooms.length;
  const totalCells = totalRooms * inspectionAreas.length;
  const doneCells = specialCleaning.filter((sc) => sc.status === 'done').length;

  return NextResponse.json({
    success: true,
    spreadsheetId: targetSheetId,
    spreadsheetUrl: targetSheetUrl,
    roomsWritten: totalRooms,
    cellsWritten: totalCells,
    doneCells,
    inspectionAreas: inspectionAreas.length,
    mode,
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
