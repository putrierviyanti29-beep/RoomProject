import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConfigured, duplicateTemplateForCurrentMonth } from '@/lib/google';

// ============================================================================
// GET /api/cron/monthly-duplicate
//
// Vercel Cron Job — runs on the 1st of every month at 00:00 UTC (07:00 WIB).
// Duplicates the template sheet into a new sheet named "{Month} {Year}"
// (e.g. "September 2026") within the same spreadsheet.
//
// Security: requires CRON_SECRET env var to be set and matched via
// ?secret=... query param OR x-api-key header. This prevents public access.
// ============================================================================

export async function GET(req: NextRequest) {
  // Verify secret — prevents random people from triggering duplication
  const authHeader = req.headers.get('authorization');
  const secretFromHeader = authHeader?.replace('Bearer ', '');
  const secretFromQuery = req.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET env var is not set. Add it in Vercel project settings.' },
      { status: 500 }
    );
  }

  if (secretFromHeader !== expectedSecret && secretFromQuery !== expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Provide ?secret=CRON_SECRET or Authorization: Bearer CRON_SECRET.' },
      { status: 401 }
    );
  }

  // Check Google config
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Google Service Account not configured.' },
      { status: 500 }
    );
  }

  const templateSpreadsheetId = process.env.GOOGLE_TEMPLATE_SPREADSHEET_ID!;

  // Duplicate template → monthly sheet
  const result = await duplicateTemplateForCurrentMonth({ spreadsheetId: templateSpreadsheetId });

  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Monthly sheet "${result.scSheetName}" ready for the current month.`,
    scSheetName: result.scSheetName,
    gcSheetName: result.gcSheetName,
    timestamp: new Date().toISOString(),
  });
}
