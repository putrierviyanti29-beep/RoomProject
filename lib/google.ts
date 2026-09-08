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

  // Private keys pasted into Vercel often lose the literal \n — restore them.
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  return { clientEmail, privateKey, templateSpreadsheetId };
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
 * Writes a 2D array of values to a specific sheet (gid) starting at A1.
 * Used to push cleaning data into the duplicated monthly spreadsheet.
 */
export async function writeSheetData(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[][]
): Promise<SyncResult> {
  const env = getGoogleEnv();
  if (!env) {
    return {
      success: false,
      error: 'Google Service Account credentials are not configured.',
    };
  }

  try {
    const auth = getAuthClient(env);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Google writeSheetData error:', err);
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

