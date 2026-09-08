import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { isGoogleConfigured, getGoogleEnv } from '@/lib/google';

// ============================================================================
// GET /api/google/debug
// Diagnostic endpoint that tests Google API connection and reports
// exactly what's working and what's broken.
// ============================================================================

export async function GET() {
  const debug: any = {
    timestamp: new Date().toISOString(),
    env_check: {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
        ? `✓ set (${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.substring(0, 30)}...)`
        : '✗ NOT SET',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ? `✓ set (length: ${process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.length})`
        : '✗ NOT SET',
      GOOGLE_TEMPLATE_SPREADSHEET_ID: process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID
        ? `✓ set (${process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID})`
        : '✗ NOT SET',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? `✓ set (length: ${process.env.SUPABASE_SERVICE_ROLE_KEY.length})`
        : '✗ NOT SET (required for data export)',
    },
    isGoogleConfigured: isGoogleConfigured(),
  };

  if (!isGoogleConfigured()) {
    debug.error = 'Google env vars not configured. See env_check above.';
    return NextResponse.json(debug, { status: 500 });
  }

  const env = getGoogleEnv()!;

  // Validate private key format
  debug.private_key_check = {
    starts_with_pem_header: env.privateKey.startsWith('-----BEGIN'),
    ends_with_pem_footer: env.privateKey.includes('-----END'),
    length: env.privateKey.length,
    first_30_chars: env.privateKey.substring(0, 30),
  };

  // Test 1: Try to authenticate
  try {
    const auth = new google.auth.JWT({
      email: env.clientEmail,
      key: env.privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });

    debug.auth_test = 'Attempting to get access token...';

    try {
      const token = await auth.getAccessToken();
      debug.auth_test = `✓ Success! Got access token (${token?.token?.substring(0, 20)}...)`;
    } catch (authErr: any) {
      debug.auth_test = `✗ FAILED: ${authErr.message}`;
      debug.error_hint =
        'Authentication failed. Possible causes:\n' +
        '1. Private key is malformed (check private_key_check above)\n' +
        '2. Service account email is wrong\n' +
        '3. Private key has been revoked (regenerate JSON key in Google Cloud Console)';
      return NextResponse.json(debug, { status: 500 });
    }

    // Test 2: Try Drive API (list files)
    try {
      const drive = google.drive({ version: 'v3', auth });
      const driveRes = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name, size)',
        pageSize: 10,
      });
      debug.drive_api_test = `✓ Success! Found ${driveRes.data.files?.length ?? 0} spreadsheet(s) in service account's Drive.`;
      debug.drive_files = (driveRes.data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
      }));
    } catch (driveErr: any) {
      debug.drive_api_test = `✗ FAILED: ${driveErr.message}`;
      if (driveErr.message.includes('has not been used') || driveErr.message.includes('is disabled')) {
        debug.drive_api_hint =
          'Google Drive API is NOT enabled. Enable it at:\n' +
          'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=456408853238';
      } else if (driveErr.message.includes('quota')) {
        debug.drive_api_hint =
          'Drive quota exceeded. The service account has 15GB free quota. ' +
          'Use write-mode (default) — it does not create new files.';
      }
    }

    // Test 3: Try Sheets API (read template spreadsheet)
    try {
      const sheets = google.sheets({ version: 'v4', auth });
      const sheetsRes = await sheets.spreadsheets.get({
        spreadsheetId: env.templateSpreadsheetId,
      });
      debug.sheets_api_test = `✓ Success! Connected to template spreadsheet "${sheetsRes.data.properties?.title ?? '(untitled)'}"`;
      debug.spreadsheet_sheets = sheetsRes.data.sheets?.map((s) => s.properties?.title) ?? [];
    } catch (sheetsErr: any) {
      debug.sheets_api_test = `✗ FAILED: ${sheetsErr.message}`;
      if (sheetsErr.message.includes('has not been used') || sheetsErr.message.includes('is disabled')) {
        debug.sheets_api_hint =
          'Google Sheets API is NOT enabled. Enable it at:\n' +
          'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=456408853238';
      } else if (sheetsErr.message.includes('not found') || sheetsErr.message.includes('404')) {
        debug.sheets_api_hint =
          'Spreadsheet not found. Possible causes:\n' +
          '1. Wrong Spreadsheet ID in env var\n' +
          '2. Spreadsheet has not been shared with the service account email\n' +
          `   Service account email: ${env.clientEmail}\n` +
          '   Share the spreadsheet with this email as Editor.';
      } else if (sheetsErr.message.includes('permission') || sheetsErr.message.includes('403')) {
        debug.sheets_api_hint =
          'Permission denied. The service account does not have access to this spreadsheet.\n' +
          `Open the spreadsheet and share it with: ${env.clientEmail} (Editor access).`;
      }
    }

    return NextResponse.json(debug);
  } catch (err: any) {
    debug.unexpected_error = err.message;
    debug.stack = err.stack;
    return NextResponse.json(debug, { status: 500 });
  }
}
