import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { isGoogleConfigured, getGoogleEnv } from '@/lib/google';

// ============================================================================
// GET /api/google/sheets
// Lists all sheets in the template spreadsheet. Useful for debugging
// "sheet not found" errors and verifying monthly duplicates.
// ============================================================================

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Google Service Account not configured.' },
      { status: 500 }
    );
  }

  const env = getGoogleEnv()!;

  try {
    const auth = new google.auth.JWT({
      email: env.clientEmail,
      key: env.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId: env.templateSpreadsheetId });

    const sheetList = (res.data.sheets ?? []).map((s) => ({
      id: s.properties?.sheetId,
      title: s.properties?.title,
      index: s.properties?.index,
      sheetType: s.properties?.sheetType,
    }));

    return NextResponse.json({
      success: true,
      spreadsheetId: env.templateSpreadsheetId,
      spreadsheetTitle: res.data.properties?.title,
      totalSheets: sheetList.length,
      sheets: sheetList,
    });
  } catch (err: any) {
    console.error('List sheets error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
