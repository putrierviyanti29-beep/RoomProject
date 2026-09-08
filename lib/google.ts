import { google } from 'googleapis';

/**
 * Initialize an authenticated Google Sheets client using a Service Account.
 * Credentials are read from environment variables (set in Vercel project settings).
 *
 * Required env vars:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL  (e.g. room-sync@your-project.iam.gserviceaccount.com)
 * - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (the full PEM private key, with \n escapes preserved)
 * - GOOGLE_TEMPLATE_SPREADSHEET_ID  (the ID of your master template spreadsheet)
 */
export interface GoogleEnv {
  clientEmail: string;
  privateKey: string;
  templateSpreadsheetId: string;
}

export function getGoogleEnv(): GoogleEnv | null {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const templateSpreadsheetId = process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID;

  if (!clientEmail || !privateKeyRaw || !templateSpreadsheetId) {
    return null;
  }

  // Robust private key normalization:
  // 1. Strip surrounding quotes if present (common paste mistake)
  // 2. Convert literal \n (backslash + n) to actual newlines
  // 3. Trim leading/trailing whitespace
  let privateKey = privateKeyRaw.trim();

  // Remove surrounding double or single quotes (paste mistake)
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1).trim();
  }

  // Convert literal \n to actual newlines (Vercel stores \n as text, not newline)
  privateKey = privateKey.replace(/\\n/g, '\n');

  // Final safety: ensure the key starts with the PEM header
  if (!privateKey.startsWith('-----BEGIN')) {
    console.error('Google private key does not start with PEM header. First 50 chars:', privateKey.substring(0, 50));
    return null;
  }

  return { clientEmail: clientEmail.trim(), privateKey, templateSpreadsheetId: templateSpreadsheetId.trim() };
}

export function isGoogleConfigured(): boolean {
  return getGoogleEnv() !== null;
}

export function getAuthClient(env: GoogleEnv) {
  const auth = new google.auth.JWT({
    email: env.clientEmail,
    key: env.privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return auth;
}

export interface SyncResult {
  success: boolean;
  newSpreadsheetId?: string;
  newSpreadsheetUrl?: string;
  error?: string;
}

/**
 * Duplicates the template spreadsheet and renames it to "{projectName} — {Month} {Year}".
 * Returns the new spreadsheet ID and URL.
 */
export async function duplicateTemplateForProject(
  projectName: string,
  month: number,
  year: number,
  templateId?: string
): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return {
      success: false,
      error: 'Google Service Account credentials are not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_TEMPLATE_SPREADSHEET_ID to your Vercel environment variables.',
    };
  }

  try {
    const auth = getAuthClient(env);
    const drive = google.drive({ version: 'v3', auth });

    const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
    const newName = `${projectName} — ${monthName} ${year}`;

    // Use Drive API to copy the template file
    const copyRes = await drive.files.copy({
      fileId: templateId ?? env.templateSpreadsheetId,
      requestBody: {
        name: newName,
      },
    });

    const newId = copyRes.data.id;
    if (!newId) {
      return { success: false, error: 'Google Drive did not return a new file ID.' };
    }

    const newUrl = `https://docs.google.com/spreadsheets/d/${newId}/edit`;

    return {
      success: true,
      newSpreadsheetId: newId,
      newSpreadsheetUrl: newUrl,
    };
  } catch (err: any) {
    console.error('Google duplicateTemplate error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

/**
 * Syncs data into the existing template structure (does NOT overwrite from A1).
 *
 * Strategy:
 * 1. Read the existing spreadsheet to find the header row ("Room Number")
 * 2. Build a map: area_id → column_offset (by matching area names in header)
 * 3. Build a map: room_number → row_index (by scanning column B for room numbers)
 * 4. For each room in DB, find its row in the spreadsheet and write
 *    [Date, Status, Done by] for each area to the correct columns
 * 5. Update "Total Rooms" and "Percentage" cells at the bottom (per area)
 *
 * This preserves the template layout — only data cells are written.
 */
export async function syncDataToTemplate(params: {
  spreadsheetId: string;
  rooms: { id: string; room_number: string }[];
  specialCleaning: {
    room_id: string;
    area_id: string;
    status: string;
    completed_at: string | null;
    profiles: { name: string } | null;
  }[];
  inspectionAreas: { id: string; name: string }[];
  targetSheetName?: string; // optional — if not provided, use first sheet
}): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId, rooms, specialCleaning, inspectionAreas, targetSheetName } = params;

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get target sheet name — either explicit or first sheet
    let sheetName: string;
    if (targetSheetName) {
      // Verify the sheet exists
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const allSheets = metaRes.data.sheets ?? [];
      const found = allSheets.find((s) => s.properties?.title === targetSheetName);
      if (!found) {
        return {
          success: false,
          error: `Sheet "${targetSheetName}" not found. Available: ${allSheets.map((s) => s.properties?.title).join(', ')}`,
        };
      }
      sheetName = targetSheetName;
    } else {
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const firstSheet = metaRes.data.sheets?.[0];
      sheetName = firstSheet?.properties?.title ?? 'Sheet1';
    }
    const safeSheetName = /^[\w]+$/.test(sheetName) ? sheetName : `'${sheetName}'`;

    // 2. Read existing values (rows 1-200, cols A-O) to find structure
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${safeSheetName}!A1:O200`,
    });
    const existingValues: (string | null)[][] = readRes.data.values ?? [];

    // 3. Find header row (contains "Room Number" in any column)
    let headerRowIdx = -1;
    for (let i = 0; i < existingValues.length; i++) {
      const row = existingValues[i] ?? [];
      for (let col = 0; col < row.length; col++) {
        if (String(row[col] ?? '').trim().toLowerCase() === 'room number') {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx >= 0) break;
    }
    if (headerRowIdx === -1) {
      return {
        success: false,
        error: 'Could not find "Room Number" header row in spreadsheet. Make sure the template has a row with "Room Number" as a column header.',
      };
    }

    // 4. Build area_id → column_offset map by matching area names in the header row
    const headerRow = existingValues[headerRowIdx] ?? [];
    const areaToColOffset: Record<string, number> = {};
    for (let col = 0; col < headerRow.length; col++) {
      const cellVal = String(headerRow[col] ?? '').trim().toLowerCase();
      const matchedArea = inspectionAreas.find((a) => {
        const areaName = a.name.trim().toLowerCase();
        return cellVal === areaName || cellVal.includes(areaName) || areaName.includes(cellVal);
      });
      if (matchedArea && cellVal.length > 0) {
        areaToColOffset[matchedArea.id] = col;
      }
    }

    if (Object.keys(areaToColOffset).length === 0) {
      return {
        success: false,
        error: `Could not match any inspection area names in the header row. Areas in DB: ${inspectionAreas.map((a) => `"${a.name}"`).join(', ')}. Header row content: ${JSON.stringify(headerRow)}`,
      };
    }

    // 5. Build room_number → row_idx map by scanning column B (index 1) below header
    const roomNumberToRow: Record<string, number> = {};
    for (let i = headerRowIdx + 2; i < existingValues.length; i++) {
      const cellVal = String(existingValues[i]?.[1] ?? '').trim();
      if (/^\d+$/.test(cellVal)) {
        roomNumberToRow[cellVal] = i; // 0-indexed
      }
    }

    // 6. Build special_cleaning lookup: (room_id, area_id) → record
    const scByKey = new Map<string, (typeof specialCleaning)[0]>();
    specialCleaning.forEach((sc) => {
      scByKey.set(`${sc.room_id}|${sc.area_id}`, sc);
    });

    // 7. Build batch update data
    const dataUpdates: { range: string; values: (string | number)[][] }[] = [];
    let totalRooms = 0;
    const areaStats: Record<string, { total: number; done: number }> = {};
    inspectionAreas.forEach((a) => {
      areaStats[a.id] = { total: 0, done: 0 };
    });

    rooms.forEach((room) => {
      const rowIdx = roomNumberToRow[room.room_number];
      if (rowIdx === undefined) return; // Room not in spreadsheet — skip

      totalRooms++;
      const rowNumber = rowIdx + 1; // 1-indexed for Google API

      inspectionAreas.forEach((area) => {
        const colOffset = areaToColOffset[area.id];
        if (colOffset === undefined) return; // Area column not in spreadsheet

        const dateCol = columnToLetter(colOffset);
        const statusCol = columnToLetter(colOffset + 1);
        const doneByCol = columnToLetter(colOffset + 2);

        const sc = scByKey.get(`${room.id}|${area.id}`);
        areaStats[area.id].total++;

        let dateStr = '';
        let statusStr = 'Pending';
        let doneBy = '';

        if (sc && sc.status === 'done') {
          areaStats[area.id].done++;
          statusStr = 'Done';
          if (sc.completed_at) {
            dateStr = new Date(sc.completed_at).toLocaleDateString('en-US');
          }
          doneBy = sc.profiles?.name ?? '';
        } else if (sc && sc.status === 'issue') {
          statusStr = 'Issue';
          if (sc.completed_at) {
            dateStr = new Date(sc.completed_at).toLocaleDateString('en-US');
          }
          doneBy = sc.profiles?.name ?? '';
        }

        dataUpdates.push({
          range: `${safeSheetName}!${dateCol}${rowNumber}`,
          values: [[dateStr]],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${statusCol}${rowNumber}`,
          values: [[statusStr]],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${doneByCol}${rowNumber}`,
          values: [[doneBy]],
        });
      });
    });

    // 8. Update "Total Rooms" and "Percentage" cells (per area, at the bottom)
    for (let i = 0; i < existingValues.length; i++) {
      const row = existingValues[i] ?? [];
      inspectionAreas.forEach((area) => {
        const colOffset = areaToColOffset[area.id];
        if (colOffset === undefined) return;

        const cellVal = String(row[colOffset] ?? '').trim().toLowerCase();
        if (cellVal === 'total rooms') {
          const countCol = columnToLetter(colOffset + 1);
          const rowNumber = i + 1;
          dataUpdates.push({
            range: `${safeSheetName}!${countCol}${rowNumber}`,
            values: [[String(areaStats[area.id].total)]],
          });
        } else if (cellVal === 'percentage') {
          const pctCol = columnToLetter(colOffset + 1);
          const rowNumber = i + 1;
          const total = areaStats[area.id].total;
          const done = areaStats[area.id].done;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          dataUpdates.push({
            range: `${safeSheetName}!${pctCol}${rowNumber}`,
            values: [[`${pct}%`]],
          });
        }
      });
    }

    // 9. Execute batch update
    if (dataUpdates.length === 0) {
      return {
        success: false,
        error: 'No data to write. Make sure the spreadsheet has room numbers in column B that match rooms in the database.',
      };
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: dataUpdates,
      },
    });

    return {
      success: true,
      newSpreadsheetId: spreadsheetId,
      newSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  } catch (err: any) {
    console.error('syncDataToTemplate error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

// Helper: convert column index (0-based) to letter (A, B, ..., Z, AA, AB, ...)
function columnToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode(65 + (c % 26)) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

/**
 * Syncs General Cleaning data (HK / ENG done status per room per day) into
 * the second sheet of the template spreadsheet.
 *
 * Strategy:
 * 1. Get all sheets in the spreadsheet — find the "General Cleaning" sheet
 *    (or fall back to the second sheet, or first sheet if only one exists)
 * 2. Read existing values to find:
 *    - Header row containing "Room Number"
 *    - Columns matching "HK", "Housekeeping", "ENG", "Engineering", "Done by HK", "Done by ENG"
 *    - Rows matching each room number (in column B)
 * 3. For each room in DB with a general_cleaning record for the selected date:
 *    - Write Done by HK name + Date to the HK column
 *    - Write Done by ENG name + Date to the ENG column
 */
export async function syncGeneralCleaningToTemplate(params: {
  spreadsheetId: string;
  date: string; // YYYY-MM-DD
  rooms: { id: string; room_number: string }[];
  gcRecords: {
    room_id: string;
    done_hk: boolean;
    done_eng: boolean;
    completed_at: string | null;
    profiles: { name: string } | null;
  }[];
  targetSheetName?: string; // optional — if not provided, find by name or fall back to sheet 2
}): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId, date, rooms, gcRecords, targetSheetName } = params;

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get all sheets — find General Cleaning sheet
    const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = metaRes.data.sheets ?? [];
    if (allSheets.length === 0) {
      return { success: false, error: 'Spreadsheet has no sheets.' };
    }

    let targetSheet;
    if (targetSheetName) {
      // Use the provided sheet name (for monthly duplicates like "September 2026")
      targetSheet = allSheets.find((s) => s.properties?.title === targetSheetName);
      if (!targetSheet) {
        return {
          success: false,
          error: `Sheet "${targetSheetName}" not found. Available sheets: ${allSheets.map((s) => s.properties?.title).join(', ')}`,
        };
      }
    } else {
      // Find General Cleaning sheet (handle typo "Ganeral")
      targetSheet = allSheets.find((s) => {
        const title = (s.properties?.title ?? '').toLowerCase();
        return title.includes('general') || title.includes('ganeral');
      });
      if (!targetSheet) targetSheet = allSheets[1] ?? allSheets[0]; // fall back to 2nd sheet, or 1st
    }
    const sheetName = targetSheet?.properties?.title ?? 'Sheet1';
    const safeSheetName = /^[\w]+$/.test(sheetName) ? sheetName : `'${sheetName}'`;

    // 2. Read existing values
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${safeSheetName}!A1:O300`,
    });
    const existingValues: (string | null)[][] = readRes.data.values ?? [];

    // 3. Find header row (contains "Room Number")
    let headerRowIdx = -1;
    for (let i = 0; i < existingValues.length; i++) {
      const row = existingValues[i] ?? [];
      for (let col = 0; col < row.length; col++) {
        if (String(row[col] ?? '').trim().toLowerCase() === 'room number') {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx >= 0) break;
    }
    if (headerRowIdx === -1) {
      return {
        success: false,
        error: `Could not find "Room Number" header row in sheet "${sheetName}". Make sure this sheet has a row with "Room Number" as a column header.`,
      };
    }

    // 4. Find HK block start & ENG block start in header row
    //    Template structure:
    //    D5='HOUSEKEEPING' → block starts at D (Date=D, Status=E, Done by=F)
    //    G5='ENGINEERING'  → block starts at G (Date=G, Status=H, Done by=I)
    const headerRow = existingValues[headerRowIdx] ?? [];
    let hkBlockStart = -1;
    let engBlockStart = -1;

    for (let col = 0; col < headerRow.length; col++) {
      const cellVal = String(headerRow[col] ?? '').trim().toLowerCase();
      if (
        (cellVal === 'housekeeping' || cellVal === 'hk' || cellVal === 'done by hk') &&
        hkBlockStart === -1
      ) {
        hkBlockStart = col;
      } else if (
        (cellVal === 'engineering' || cellVal === 'eng' || cellVal === 'done by eng') &&
        engBlockStart === -1
      ) {
        engBlockStart = col;
      }
    }

    if (hkBlockStart === -1 && engBlockStart === -1) {
      return {
        success: false,
        error: `Could not find HOUSEKEEPING or ENGINEERING columns in sheet "${sheetName}" header row. Header content: ${JSON.stringify(headerRow)}`,
      };
    }

    // 5. Build room_number → row_idx map (column B, below header)
    const roomNumberToRow: Record<string, number> = {};
    for (let i = headerRowIdx + 1; i < existingValues.length; i++) {
      const cellVal = String(existingValues[i]?.[1] ?? '').trim();
      if (/^\d+$/.test(cellVal)) {
        roomNumberToRow[cellVal] = i;
      }
    }

    // 6. Build gc lookup: room_id → record
    const gcByRoom = new Map<string, (typeof gcRecords)[0]>();
    gcRecords.forEach((g) => gcByRoom.set(g.room_id, g));

    // 7. Build batch update data
    //    For each room, write 3 cells per block:
    //      Date col = completion date (if done) or empty
    //      Status col = 'Done' (if done) or 'Pending'
    //      Done by col = profile name (if done) or empty
    const dataUpdates: { range: string; values: (string | number)[][] }[] = [];
    let roomsWithHK = 0;
    let roomsWithENG = 0;
    let roomsWritten = 0;

    rooms.forEach((room) => {
      const rowIdx = roomNumberToRow[room.room_number];
      if (rowIdx === undefined) return;

      const gc = gcByRoom.get(room.id);
      const rowNumber = rowIdx + 1; // 1-indexed for API

      roomsWritten++;

      const dateStr = gc?.completed_at
        ? new Date(gc.completed_at).toLocaleDateString('en-US')
        : '';
      const doneByName = gc?.profiles?.name ?? '';

      // HK block: Date | Status | Done by
      if (hkBlockStart >= 0) {
        const dateCol = columnToLetter(hkBlockStart);
        const statusCol = columnToLetter(hkBlockStart + 1);
        const doneByCol = columnToLetter(hkBlockStart + 2);

        dataUpdates.push({
          range: `${safeSheetName}!${dateCol}${rowNumber}`,
          values: [[gc?.done_hk ? dateStr : '']],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${statusCol}${rowNumber}`,
          values: [[gc?.done_hk ? 'Done' : 'Pending']],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${doneByCol}${rowNumber}`,
          values: [[gc?.done_hk ? doneByName : '']],
        });
        if (gc?.done_hk) roomsWithHK++;
      }

      // ENG block: Date | Status | Done by
      if (engBlockStart >= 0) {
        const dateCol = columnToLetter(engBlockStart);
        const statusCol = columnToLetter(engBlockStart + 1);
        const doneByCol = columnToLetter(engBlockStart + 2);

        dataUpdates.push({
          range: `${safeSheetName}!${dateCol}${rowNumber}`,
          values: [[gc?.done_eng ? dateStr : '']],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${statusCol}${rowNumber}`,
          values: [[gc?.done_eng ? 'Done' : 'Pending']],
        });
        dataUpdates.push({
          range: `${safeSheetName}!${doneByCol}${rowNumber}`,
          values: [[gc?.done_eng ? doneByName : '']],
        });
        if (gc?.done_eng) roomsWithENG++;
      }
    });

    if (dataUpdates.length === 0) {
      return {
        success: false,
        error: 'No data to write. Make sure the General Cleaning sheet has room numbers in column B that match rooms in the database.',
      };
    }

    // 8. Batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: dataUpdates,
      },
    });

    return {
      success: true,
      newSpreadsheetId: spreadsheetId,
      newSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${targetSheet?.properties?.sheetId ?? 0}`,
    };
  } catch (err: any) {
    console.error('syncGeneralCleaningToTemplate error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

/**
 * Duplicates ALL template sheets into monthly-named sheets:
 * - "{Month} {Year} - SC"      ← from "Special Cleaning TEMPLATE"
 * - "{Month} {Year} - GC"      ← from "Ganeral Cleaning TEMPLATE"
 * - "{Month} {Year} - Linen"   ← from "Inventory Linen TEMPLATE"
 * - "{Month} {Year} - AsetRoom" ← from "Inventory Aset Room TEMPLATE"
 * - "{Month} {Year} - AsetArea" ← from "Inventory Aset Area TEMPLATE" (if exists)
 * - "{Month} {Year} - Equipment" ← from "Inventory Equipment TEMPLATE"
 *
 * Why separate sheets? Each template has different structure (matrix vs flat table,
 * different columns) and must be kept separate.
 *
 * Idempotent — skips sheets that already exist.
 * Returns a map of template_key → monthly_sheet_name.
 */
export interface MonthlyDupResult {
  success: boolean;
  scSheetName?: string;
  gcSheetName?: string;
  linenSheetName?: string;
  asetRoomSheetName?: string;
  asetAreaSheetName?: string;
  equipmentSheetName?: string;
  error?: string;
}

export async function duplicateTemplateForCurrentMonth(params: {
  spreadsheetId: string;
  year?: number;
  month?: number;
}): Promise<MonthlyDupResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId } = params;
  const now = new Date();
  const year = params.year ?? now.getFullYear();
  const month = params.month ?? now.getMonth() + 1;
  const monthName = now.toLocaleString('en-US', { month: 'long' });

  // Template → monthly suffix mapping
  const templates: Array<{
    key: 'sc' | 'gc' | 'linen' | 'asetRoom' | 'asetArea' | 'equipment';
    nameField: keyof Omit<MonthlyDupResult, 'success' | 'error'>;
    matchKeywords: string[]; // any of these keywords in title → match
    suffix: string; // e.g. "- SC"
  }> = [
    { key: 'sc', nameField: 'scSheetName', matchKeywords: ['special', 'cleaning'], suffix: ' - SC' },
    { key: 'gc', nameField: 'gcSheetName', matchKeywords: ['general', 'ganeral'], suffix: ' - GC' },
    { key: 'linen', nameField: 'linenSheetName', matchKeywords: ['linen'], suffix: ' - Linen' },
    { key: 'asetRoom', nameField: 'asetRoomSheetName', matchKeywords: ['aset', 'asset', 'room'], suffix: ' - AsetRoom' },
    { key: 'asetArea', nameField: 'asetAreaSheetName', matchKeywords: ['aset', 'asset', 'area'], suffix: ' - AsetArea' },
    { key: 'equipment', nameField: 'equipmentSheetName', matchKeywords: ['equipment'], suffix: ' - Equipment' },
  ];

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = metaRes.data.sheets ?? [];

    // Find each template sheet by matching keywords in the title
    // Special: 'aset' templates need 2-step matching (room vs area)
    const foundTemplates: Record<string, any> = {};
    for (const t of templates) {
      const candidates = allSheets.filter((s) => {
        const title = (s.properties?.title ?? '').toLowerCase();
        if (!title.includes('template')) return false;
        // For aset room vs aset area, we need to distinguish
        if (t.key === 'asetRoom') {
          return title.includes('aset') && title.includes('room') && !title.includes('area');
        }
        if (t.key === 'asetArea') {
          return title.includes('aset') && title.includes('area');
        }
        // For others, all keywords must be present
        return t.matchKeywords.every((kw) => title.includes(kw));
      });
      foundTemplates[t.key] = candidates[0] ?? null;
    }

    // Helper: duplicate a sheet & rename
    const duplicateAndRename = async (sourceSheetId: number, newTitle: string): Promise<string | undefined> => {
      const dupRes = await sheets.spreadsheets.sheets.copyTo({
        spreadsheetId,
        sheetId: sourceSheetId,
        requestBody: { destinationSpreadsheetId: spreadsheetId },
      });
      const newSheetId = dupRes.data.sheetId;
      if (newSheetId !== undefined && newSheetId !== null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: { sheetId: newSheetId, title: newTitle },
                  fields: 'title',
                },
              },
            ],
          },
        });
        return newTitle;
      }
      return undefined;
    };

    const result: MonthlyDupResult = { success: true };
    const monthSheetPrefix = `${monthName} ${year}`;

    for (const t of templates) {
      const templateSheet = foundTemplates[t.key];
      if (!templateSheet) continue; // template doesn't exist — skip
      const monthlyName = `${monthSheetPrefix}${t.suffix}`;
      // Check if monthly sheet already exists
      const existing = allSheets.find((s) => s.properties?.title === monthlyName);
      if (existing) {
        (result as any)[t.nameField] = monthlyName;
      } else {
        const created = await duplicateAndRename(templateSheet.properties?.sheetId!, monthlyName);
        if (created) {
          (result as any)[t.nameField] = created;
        }
      }
    }

    return result;
  } catch (err: any) {
    console.error('duplicateTemplateForCurrentMonth error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

/**
 * Lists all spreadsheets owned by the service account.
 * Useful for cleanup (when Drive quota is exceeded).
 */
export async function listServiceAccountFiles(): Promise<{ id: string; name: string; size: string }[] | { error: string }> {
  const env = getGoogleEnv();
  if (!env) {
    return { error: 'Google Service Account credentials are not configured.' };
  }

  try {
    const auth = getAuthClient(env);
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, size)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
      size: f.size ?? '0',
    }));
  } catch (err: any) {
    console.error('Google listServiceAccountFiles error:', err);
    return { error: err?.message ?? 'Unknown Google API error' };
  }
}

/**
 * Deletes a file owned by the service account (to free up Drive quota).
 */
export async function deleteServiceAccountFile(fileId: string): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  try {
    const auth = getAuthClient(env);
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.delete({ fileId });
    return { success: true };
  } catch (err: any) {
    console.error('Google deleteServiceAccountFile error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

/**
 * Lists all spreadsheets in the service account's drive (for verification).
 * Returns { id, name }[] — useful for the admin UI to show synced sheets.
 */
export async function listSpreadsheets(): Promise<{ id: string; name: string }[] | { error: string }> {
  const env = getGoogleEnv();
  if (!env) {
    return { error: 'Google Service Account credentials are not configured.' };
  }

  try {
    const auth = getAuthClient(env);
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });

    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? '',
    }));
  } catch (err: any) {
    console.error('Google listSpreadsheets error:', err);
    return { error: err?.message ?? 'Unknown Google API error' };
  }
}

/**
 * Syncs Inventory Equipment data into a sheet (duplicated monthly template).
 *
 * Equipment template structure:
 * - Row 2: 'MONTHLY INVENTORY EQUIPMENT' (title)
 * - Row 3: 'Date : ...' (date)
 * - Row 4: Headers — B4=No | C4=Items | D4=Previous Balance | E4=New Purchase |
 *           F4=Condition (Good) | G4=Condition (Broken) | H4=Closing inventory |
 *           I4=Need to purchase | J4=Price/Unit | K4=Total price
 * - Row 5: Sub-headers (C5='Machine', F5='Good', G5='Broken')
 * - Row 7+: Data rows (1 row per item)
 *
 * We write data starting from row 7. The 'Total price' column (K) is written
 * as a formula =SUM(I*J) so it auto-recalculates in the sheet.
 */
export async function syncEquipmentToSheet(params: {
  spreadsheetId: string;
  targetSheetName?: string;
  equipment: Array<{
    no: number;
    item_name: string;
    previous_balance: number | null;
    new_purchase: number | null;
    condition_good: number | null;
    condition_broken: number | null;
    closing_inventory: number | null;
    need_to_purchase: number | null;
    price_per_unit: number | null;
  }>;
  date?: string; // YYYY-MM-DD for the 'Date :' cell
}): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId, targetSheetName, equipment, date } = params;

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    // Determine target sheet
    let sheetName: string;
    if (targetSheetName) {
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const found = (metaRes.data.sheets ?? []).find((s) => s.properties?.title === targetSheetName);
      if (!found) {
        return { success: false, error: `Sheet "${targetSheetName}" not found.` };
      }
      sheetName = targetSheetName;
    } else {
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const found = (metaRes.data.sheets ?? []).find((s) => {
        const title = (s.properties?.title ?? '').toLowerCase();
        return title.includes('equipment');
      });
      sheetName = found?.properties?.title ?? 'Sheet1';
    }
    const safeSheetName = /^[\w]+$/.test(sheetName) ? sheetName : `'${sheetName}'`;

    const dateStr = date || new Date().toISOString().split('T')[0];
    const dataUpdates: { range: string; values: (string | number)[][] }[] = [
      {
        range: `${safeSheetName}!B3`,
        values: [[`Date : ${new Date(dateStr).toLocaleDateString('en-US')}`]],
      },
    ];

    // Write equipment data starting from row 7
    // Null values are written as empty string (so cell appears empty, not '0')
    equipment.forEach((item, idx) => {
      const row = 7 + idx;
      const totalFormula = `=SUM(I${row}*J${row})`;
      dataUpdates.push({
        range: `${safeSheetName}!B${row}:K${row}`,
        values: [[
          item.no,
          item.item_name,
          item.previous_balance === null ? '' : item.previous_balance,
          item.new_purchase === null ? '' : item.new_purchase,
          item.condition_good === null ? '' : item.condition_good,
          item.condition_broken === null ? '' : item.condition_broken,
          item.closing_inventory === null ? '' : item.closing_inventory,
          item.need_to_purchase === null ? '' : item.need_to_purchase,
          item.price_per_unit === null ? '' : item.price_per_unit,
          totalFormula,
        ]],
      });
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED', // so formulas are interpreted
        data: dataUpdates,
      },
    });

    return {
      success: true,
      newSpreadsheetId: spreadsheetId,
      newSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  } catch (err: any) {
    console.error('syncEquipmentToSheet error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

/**
 * Syncs Inventory Linen data into a sheet (duplicated monthly template).
 *
 * Linen template structure (from inspection):
 * - 9 horizontal blocks, each with: ITEMS column + N room/storage columns + Remarks
 * - Block 1 (col B-J): Storages — ROOM, Gudang 3C, Gudang 5C, Gudang 4A, Office, OOO
 * - Block 2 (col L-AA): Rooms 201-213 (Section C Floor 2)
 * - Block 3 (col AD-AS): Rooms 312-324 (Section C Floor 3)
 * - Block 4 (col AV-BR): Rooms 412-424 + 331-337
 * - Block 5 (col BU-CJ): Rooms 412-424 (duplicate)
 * - Block 6 (col CL-DA): Rooms 508-520 (Section C Floor 5)
 * - Block 7 (col DC-DP): Rooms 301-311 (Section A Floor 3)
 * - Block 8 (col DR-EE): Rooms 401-411 (Section A Floor 4)
 * - Block 9 (col EG-EP): Rooms 501-507 (Section A Floor 5)
 * - Row 4: Header row (ITEMS, room numbers, Remarks)
 * - Row 5: Section label (e.g. "Bed Room")
 * - Row 6+: Data rows (1 row per linen item)
 *
 * Strategy: read the sheet, find each block by scanning row 4 for 'ITEMS' columns,
 * then for each (item, location) pair in DB, find the matching row (by item_name
 * in column B/L/AD/etc) and write the count to the matching column.
 */
// Generic matrix sync function (used by Linen, Aset Room, Aset Area)
// All three modules have the same structure: items × locations matrix
export async function syncInventoryMatrixToSheet(params: {
  spreadsheetId: string;
  targetSheetName?: string;
  records: Array<{
    item_name: string;
    location: string;
    count: number | null;
  }>;
  sheetNameKeyword?: string; // keyword to find sheet if targetSheetName not provided (e.g. 'linen', 'aset')
}): Promise<SyncResult & { cellsWritten?: number }> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId, targetSheetName, records, sheetNameKeyword } = params;

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    // Determine target sheet
    let sheetName: string;
    if (targetSheetName) {
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const found = (metaRes.data.sheets ?? []).find((s) => s.properties?.title === targetSheetName);
      if (!found) {
        return { success: false, error: `Sheet "${targetSheetName}" not found.` };
      }
      sheetName = targetSheetName;
    } else {
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const keyword = sheetNameKeyword ?? 'linen';
      const found = (metaRes.data.sheets ?? []).find((s) => {
        const title = (s.properties?.title ?? '').toLowerCase();
        return title.includes(keyword);
      });
      sheetName = found?.properties?.title ?? 'Sheet1';
    }
    const safeSheetName = /^[\w]+$/.test(sheetName) ? sheetName : `'${sheetName}'`;

    // Read entire sheet (rows 1-220, cols A-FZ to cover all 155 columns)
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${safeSheetName}!A1:FZ220`,
    });
    const existingValues: (string | null)[][] = readRes.data.values ?? [];

    // Find all "ITEMS" header columns in row 4 (the header row)
    // Each ITEMS column starts a new block. The actual item names are in the
    // column NEXT to ITEMS (e.g. B4='ITEMS', C6='Bath Towel' — so itemsCol = B+1 = C)
    const headerRowIdx = 3; // row 4 (0-indexed)
    const headerRow = existingValues[headerRowIdx] ?? [];
    const blocks: { itemsCol: number; locationCols: Map<string, number> }[] = [];

    for (let col = 0; col < headerRow.length; col++) {
      const cellVal = String(headerRow[col] ?? '').trim().toLowerCase();
      if (cellVal === 'items') {
        // Found a block start — the ITEMS header is at `col`, but item NAMES
        // are stored in the column right after it (col+1). The number column
        // (1, 2, 3, ...) is at `col`, item name is at `col+1`.
        const itemsNameCol = col + 1;

        // Scan subsequent columns (starting from itemsNameCol+1) for locations
        // Use case-insensitive keys so 'Linen Room' (DB) matches 'LINEN ROOM' (sheet)
        const locationCols = new Map<string, number>();
        for (let c = itemsNameCol + 1; c < headerRow.length; c++) {
          const locVal = String(headerRow[c] ?? '').trim();
          if (!locVal) continue;
          if (locVal.toLowerCase() === 'remarks') break; // end of block
          // Room numbers in sheet are stored as numbers (e.g. 201.0)
          // Convert to string without decimal: '201.0' → '201'
          const normalizedLoc = /^-?\d+(\.\d+)?$/.test(locVal)
            ? String(parseInt(locVal, 10))
            : locVal;
          const normalizedKey = normalizedLoc.toLowerCase();
          if (!locationCols.has(normalizedKey)) {
            locationCols.set(normalizedKey, c);
          }
        }
        blocks.push({ itemsCol: itemsNameCol, locationCols });
      }
    }

    if (blocks.length === 0) {
      return { success: false, error: 'Could not find any ITEMS header columns in row 4.' };
    }

    // Build item_name → row_idx map (search column at itemsCol of each block, rows 6+)
    // We'll do this per block since each block has its own items column
    const dataUpdates: { range: string; values: (string | number)[][] }[] = [];
    let cellsWritten = 0;

    records.forEach((rec) => {
      const normalizedRecLocation = rec.location.toLowerCase();
      blocks.forEach((block) => {
        // Find the row matching this item_name in this block's items column
        // Use case-insensitive matching for item name too
        for (let r = 5; r < existingValues.length; r++) {
          const cellVal = String(existingValues[r]?.[block.itemsCol] ?? '').trim();
          if (cellVal.toLowerCase() === rec.item_name.toLowerCase()) {
            // Found the row — now find the column for this location (case-insensitive)
            const col = block.locationCols.get(normalizedRecLocation);
            if (col !== undefined) {
              const rowNumber = r + 1; // 1-indexed
              const colLetter = columnToLetter(col);
              dataUpdates.push({
                range: `${safeSheetName}!${colLetter}${rowNumber}`,
                values: [[rec.count === null || rec.count === undefined ? '' : String(rec.count)]],
              });
              cellsWritten++;
            }
            break; // found the item row, stop searching
          }
        }
      });
    });

    if (dataUpdates.length === 0) {
      // Build helpful debug info
      const sampleRecs = records.slice(0, 5).map((r) => `${r.item_name}@${r.location}`);
      const sampleBlocks = blocks.slice(0, 3).map((b, i) => {
        const locs = Array.from(b.locationCols.keys()).slice(0, 5);
        return `Block${i + 1}(itemsCol=${b.itemsCol}, locations=[${locs.join(', ')}...])`;
      });
      return {
        success: false,
        error: `No matching cells found.

Records from DB (sample): ${sampleRecs.join(' | ')}
Total records: ${records.length}

Blocks found in sheet (sample): ${sampleBlocks.join(' | ')}
Total blocks: ${blocks.length}

Common causes:
1. Item names in DB don't match item names in sheet (case-insensitive match is used)
2. Location names in DB don't match column headers in sheet
   - DB has 'Linen Room' but sheet has 'LINEN ROOM' (handled, but verify)
   - DB has 'Gudang 3C' but sheet Block 1 only has 'LINEN ROOM' column
3. Records have count=0 and no row exists in sheet for that item

Tip: Open the sheet and verify that item names in column C/M/AE/etc match
the item_name values in your database.`,
      };
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: dataUpdates,
      },
    });

    return {
      success: true,
      newSpreadsheetId: spreadsheetId,
      newSpreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      cellsWritten,
    };
  } catch (err: any) {
    console.error('syncInventoryMatrixToSheet error:', err);
    return {
      success: false,
      error: err?.message ?? 'Unknown Google API error',
    };
  }
}

// Wrapper for Aset Room sync (same logic as Linen matrix, different sheet keyword)
export async function syncInventoryAsetRoomToSheet(params: {
  spreadsheetId: string;
  targetSheetName?: string;
  records: Array<{ item_name: string; location: string; count: number | null }>;
}): Promise<SyncResult & { cellsWritten?: number }> {
  return syncInventoryMatrixToSheet({
    ...params,
    sheetNameKeyword: 'aset',
  });
}

// Wrapper for Aset Area sync (same logic, different sheet)
export async function syncInventoryAsetAreaToSheet(params: {
  spreadsheetId: string;
  targetSheetName?: string;
  records: Array<{ item_name: string; location: string; count: number | null }>;
}): Promise<SyncResult & { cellsWritten?: number }> {
  return syncInventoryMatrixToSheet({
    ...params,
    sheetNameKeyword: 'aset',
  });
}