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
}): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return { success: false, error: 'Google Service Account credentials are not configured.' };
  }

  const { spreadsheetId, rooms, specialCleaning, inspectionAreas } = params;

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get first sheet name
    const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
    const firstSheet = metaRes.data.sheets?.[0];
    const sheetName = firstSheet?.properties?.title ?? 'Sheet1';
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

