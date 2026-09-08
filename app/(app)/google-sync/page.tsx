'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  ExternalLink,
  Sheet,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Settings,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { SpecialProject } from '@/lib/types';
import { MONTH_NAMES } from '@/lib/types';

interface SyncStatus {
  configured: boolean;
  message: string;
}

interface SyncResult {
  success: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  rowsWritten?: number;
  error?: string;
  warning?: string;
}

export default function GoogleSyncPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [projects, setProjects] = useState<SpecialProject[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, SyncResult>>({});

  // Role guard: admin only
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      checkStatus();
      fetchProjects();
    }
  }, [profile]);

  async function checkStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/google/sync');
      const data = await res.json();
      setStatus(data);
    } catch (e: any) {
      setStatus({ configured: false, message: e.message });
    }
    setStatusLoading(false);
  }

  async function fetchProjects() {
    const { data } = await supabase
      .from('special_projects')
      .select('id, project_name, month, year, created_at')
      .order('created_at', { ascending: false });
    setProjects(data ?? []);
  }

  async function handleSync(project: SpecialProject) {
    setSyncing(project.id);
    try {
      const res = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.project_name,
          month: project.month,
          year: project.year,
        }),
      });
      const data: SyncResult = await res.json();
      setLastResults((prev) => ({ ...prev, [project.id]: data }));

      if (data.success) {
        toast({
          title: 'Spreadsheet created',
          description: `${project.project_name} → ${data.rowsWritten} rows written.`,
        });
      } else {
        toast({
          title: 'Sync failed',
          description: data.error ?? data.warning,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      const result: SyncResult = { success: false, error: e.message };
      setLastResults((prev) => ({ ...prev, [project.id]: result }));
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    }
    setSyncing(null);
  }

  if (authLoading || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Sheets Sync"
        description="Duplicate the master spreadsheet template for each project and export cleaning data automatically."
        action={
          <Button variant="outline" size="sm" onClick={checkStatus} disabled={statusLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
            Check Status
          </Button>
        }
      />

      {/* Status card */}
      <Card className={`card-shadow-lg ${status?.configured ? 'border-emerald-200' : 'border-amber-200'}`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            {statusLoading ? (
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : status?.configured ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {statusLoading
                  ? 'Checking Google Service Account...'
                  : status?.configured
                  ? 'Google Service Account is configured'
                  : 'Google Service Account is NOT configured'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{status?.message}</p>

              {!status?.configured && !statusLoading && (
                <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p className="font-medium text-amber-900">Setup instructions:</p>
                  <ol className="list-inside list-decimal space-y-1 text-amber-800">
                    <li>
                      Open{' '}
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline"
                      >
                        Google Cloud Console
                      </a>{' '}
                      and create a new project (or use existing).
                    </li>
                    <li>
                      Enable <strong>Google Sheets API</strong> and <strong>Google Drive API</strong> (APIs &amp; Services → Library).
                    </li>
                    <li>
                      Create a <strong>Service Account</strong> (IAM &amp; Admin → Service Accounts → Create).
                    </li>
                    <li>
                      Generate a <strong>JSON key</strong> for the service account (Keys tab → Add Key → JSON).
                    </li>
                    <li>
                      Open your master template spreadsheet → <strong>Share</strong> → paste the service account email (e.g. <code>room-sync@your-proj.iam.gserviceaccount.com</code>) → Editor access.
                    </li>
                    <li>
                      Copy the <strong>Spreadsheet ID</strong> from the URL: <code>docs.google.com/spreadsheets/d/<strong>[THIS_PART]</strong>/edit</code>
                    </li>
                    <li>
                      In Vercel project settings → Environment Variables, add:
                      <ul className="ml-6 mt-1 list-disc space-y-1">
                        <li><code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> = service account email</li>
                        <li><code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> = the entire <code>private_key</code> value from JSON (keep the quotes, keep the <code>\n</code> escapes)</li>
                        <li><code>GOOGLE_TEMPLATE_SPREADSHEET_ID</code> = spreadsheet ID from step 6</li>
                        <li><code>SUPABASE_SERVICE_ROLE_KEY</code> = Supabase Settings → API → service_role key</li>
                      </ul>
                    </li>
                    <li>Redeploy and come back to this page.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects to sync */}
      <Card className="card-shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sheet className="h-5 w-5" />
            Sync Projects
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click <strong>Sync</strong> on a project to duplicate the template and export cleaning data for that month.
            The new spreadsheet will be named &quot;{`{Project} — {Month} {Year}`}&quot;.
          </p>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No projects yet. Create one in Special Cleaning first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project, i) => {
                const result = lastResults[project.id];
                const isSyncing = syncing === project.id;
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{project.project_name}</p>
                        <Badge variant="outline" className="text-xs">
                          {MONTH_NAMES[project.month - 1]} {project.year}
                        </Badge>
                      </div>
                      {result?.success ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Synced · {result.rowsWritten} rows written
                          {result.spreadsheetUrl && (
                            <a
                              href={result.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-0.5 font-medium underline"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                      ) : result ? (
                        <p className="mt-1 flex items-start gap-1 text-xs text-red-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          <span>{result.error ?? result.warning}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Not synced yet
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSync(project)}
                      disabled={isSyncing || !status?.configured}
                      className="gold-gradient text-navy hover:opacity-90"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Sheet className="mr-2 h-4 w-4" />
                          Sync to Sheet
                        </>
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Settings className="h-4 w-4" />
            How it works
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>The service account duplicates your master template for each project.</li>
            <li>The new spreadsheet is named &quot;{`{ProjectName} — {Month} {Year}`}&quot;.</li>
            <li>Cleaning data (rooms, status, done type, completed_at, special cleaning checklist) is written into Sheet1 of the new file.</li>
            <li>You can re-sync a project any time — it creates a fresh copy with the latest data.</li>
            <li>Service account credentials are stored only in Vercel env vars — never in the database.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
