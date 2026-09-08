'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { MONTH_NAMES } from '@/lib/types';

interface GCReportRow {
  room_number: string;
  room_type: string;
  status: string;
  completed_by: string;
  completed_at: string | null;
  date: string;
}

interface SCReportRow {
  project_name: string;
  month: number;
  year: number;
  item_name: string;
  status: string;
  completed_by: string;
  completed_at: string | null;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [gcData, setGcData] = useState<GCReportRow[]>([]);
  const [scData, setScData] = useState<SCReportRow[]>([]);
  const [spData, setSpData] = useState<{ project_name: string; total: number; done: number; progress: number }[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Role guard: only admin & manager can view reports
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin' && profile.role !== 'manager') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  const fetchReports = useCallback(async () => {
    setLoading(true);

    const [gcRes, scRes] = await Promise.all([
      supabase
        .from('general_cleaning')
        .select('status, date, completed_at, rooms!inner(room_number, room_types!inner(name)), profiles(name)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false }),
      supabase
        .from('special_checklists')
        .select('item_name, status, completed_at, created_at, special_projects!inner(project_name, month, year), profiles(name)')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('completed_at', { ascending: false, nullsFirst: false }),
    ]);

    const gcRows: GCReportRow[] = (gcRes.data ?? []).map((g: any) => ({
      room_number: g.rooms?.room_number ?? '—',
      room_type: g.rooms?.room_types?.name ?? '—',
      status: g.status,
      completed_by: g.profiles?.name ?? '—',
      completed_at: g.completed_at,
      date: g.date,
    }));
    setGcData(gcRows);

    const scRows: SCReportRow[] = (scRes.data ?? []).map((s: any) => ({
      project_name: s.special_projects?.project_name ?? '—',
      month: s.special_projects?.month ?? 0,
      year: s.special_projects?.year ?? 0,
      item_name: s.item_name,
      status: s.status,
      completed_by: s.profiles?.name ?? '—',
      completed_at: s.completed_at,
    }));
    setScData(scRows);

    // Aggregate special projects progress
    const spMap = new Map<string, { project_name: string; total: number; done: number }>();
    scRows.forEach((r) => {
      const key = r.project_name;
      if (!spMap.has(key)) {
        spMap.set(key, { project_name: r.project_name, total: 0, done: 0 });
      }
      const entry = spMap.get(key)!;
      entry.total++;
      if (r.status === 'done') entry.done++;
    });
    setSpData(
      Array.from(spMap.values()).map((v) => ({
        ...v,
        progress: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
      }))
    );

    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Block rendering until role is verified
  if (authLoading || !profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (data.length === 0) {
      toast({ title: 'No Data', description: 'There is no data to export.', variant: 'destructive' });
      return;
    }
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`;
          return str;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: 'Export Complete', description: `${filename} has been downloaded.` });
  }

  const gcDone = gcData.filter((r) => r.status === 'done').length;
  const gcPending = gcData.filter((r) => r.status === 'pending').length;
  const scDone = scData.filter((r) => r.status === 'done').length;
  const scTotal = scData.length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="View and export cleaning reports for any date range."
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" className="pl-10 w-auto" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <span className="text-muted-foreground">to</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" className="pl-10 w-auto" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'GC Completed', value: gcDone, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'GC Pending', value: gcPending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'SC Completed', value: scDone, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'SC Total Items', value: scTotal, icon: TrendingUp, color: 'text-navy', bg: 'bg-muted' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Card className="card-shadow-lg">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Tabs defaultValue="general">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="general">General Cleaning</TabsTrigger>
          <TabsTrigger value="special">Special Cleaning</TabsTrigger>
        </TabsList>

        {/* General Cleaning Report */}
        <TabsContent value="general" className="mt-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="card-shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">General Cleaning Report</CardTitle>
                    <p className="text-sm text-muted-foreground">{gcData.length} records in selected range</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(gcData as unknown as Record<string, unknown>[], 'general-cleaning-report.csv')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Completed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <TableCell key={j}><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : gcData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No records in this date range
                          </TableCell>
                        </TableRow>
                      ) : (
                        gcData.slice(0, 100).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</TableCell>
                            <TableCell className="font-medium">{row.room_number}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.room_type}</Badge></TableCell>
                            <TableCell>
                              {row.status === 'done' ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Done</Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.completed_by}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {gcData.length > 100 && (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Showing first 100 of {gcData.length} records. Export CSV for full data.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Special Cleaning Report */}
        <TabsContent value="special" className="mt-6 space-y-6">
          {/* Project progress chart */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="card-shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Project Progress Comparison</CardTitle>
                <p className="text-sm text-muted-foreground">Completed vs total items per project</p>
              </CardHeader>
              <CardContent>
                {spData.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    No special cleaning data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={spData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 10%, 90%)" />
                      <XAxis dataKey="project_name" stroke="hsl(215, 16%, 47%)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(215, 16%, 47%)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(40, 10%, 88%)',
                          background: 'hsl(0, 0%, 100%)',
                          fontSize: '13px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="done" name="Completed" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total" name="Total" fill="hsl(43, 74%, 50%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Special cleaning table */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <Card className="card-shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Special Cleaning Report</CardTitle>
                    <p className="text-sm text-muted-foreground">{scData.length} checklist items</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportCSV(scData as unknown as Record<string, unknown>[], 'special-cleaning-report.csv')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Project</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Completed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <TableCell key={j}><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : scData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No special cleaning records
                          </TableCell>
                        </TableRow>
                      ) : (
                        scData.slice(0, 100).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">{row.project_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.month > 0 ? `${MONTH_NAMES[row.month - 1]} ${row.year}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm">{row.item_name}</TableCell>
                            <TableCell>
                              {row.status === 'done' ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Done</Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.completed_by}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {scData.length > 100 && (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Showing first 100 of {scData.length} records. Export CSV for full data.
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
