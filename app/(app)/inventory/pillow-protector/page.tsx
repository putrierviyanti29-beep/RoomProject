'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  RefreshCw,
  Sheet,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { InventoryPillowProtector, Room } from '@/lib/types';

interface SyncResult {
  success: boolean;
  spreadsheetUrl?: string;
  sheetName?: string;
  roomsWritten?: number;
  error?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface RoomWithPP extends Omit<Room, 'room_types'> {
  pillow_protector?: InventoryPillowProtector[];
  room_types?: { id: string; name: string } | null;
}

interface SectionGroup {
  section: string;
  floors: { floor: number; rooms: RoomWithPP[] }[];
}

export default function PillowProtectorPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomWithPP[]>([]);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [updating, setUpdating] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canEdit = isAdmin || isSupervisor;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomsRes, ppRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, room_number, room_type_id, section, floor, room_types(id, name)')
        .order('room_number', { ascending: true }),
      supabase
        .from('inventory_pillow_protector')
        .select('id, room_id, status, done_by, done_at, notes, remaks, period_month, period_year, created_at, updated_at, profiles!done_by(name)')
        .eq('period_month', periodMonth)
        .eq('period_year', periodYear),
    ]);

    if (roomsRes.error) {
      toast({ title: 'Gagal memuat rooms', description: roomsRes.error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const ppByRoom = new Map<string, InventoryPillowProtector>();
    (ppRes.data ?? []).forEach((p: any) => {
      ppByRoom.set(p.room_id, p as InventoryPillowProtector);
    });

    const merged = ((roomsRes.data ?? []) as any[]).map((r) => ({
      ...r,
      room_types: Array.isArray(r.room_types) ? r.room_types[0] ?? null : r.room_types,
      pillow_protector: ppByRoom.has(r.id) ? [ppByRoom.get(r.id)!] : [],
    })) as RoomWithPP[];

    setRooms(merged);
    setLoading(false);
  }, [periodMonth, periodYear, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group rooms by section → floor
  const sectionGroups: SectionGroup[] = useMemo(() => {
    const sectionMap = new Map<string, SectionGroup>();
    rooms.forEach((r) => {
      const sec = r.section ?? 'Unassigned';
      if (!sectionMap.has(sec)) sectionMap.set(sec, { section: sec, floors: [] });
      const sg = sectionMap.get(sec)!;
      const fl = r.floor ?? 0;
      let fg = sg.floors.find((f) => f.floor === fl);
      if (!fg) {
        fg = { floor: fl, rooms: [] };
        sg.floors.push(fg);
      }
      fg.rooms.push(r);
    });
    return Array.from(sectionMap.values())
      .sort((a, b) => a.section.localeCompare(b.section))
      .map((g) => ({ ...g, floors: g.floors.sort((a, b) => a.floor - b.floor) }));
  }, [rooms]);

  async function toggleDone(room: RoomWithPP) {
    if (!user || !canEdit) return;
    setUpdating(room.id);
    const existing = room.pillow_protector?.[0];

    if (existing) {
      const newStatus = existing.status === 'done' ? 'pending' : 'done';
      const { error } = await supabase
        .from('inventory_pillow_protector')
        .update({
          status: newStatus,
          done_by: newStatus === 'done' ? user.id : null,
          done_at: newStatus === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Gagal update', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: newStatus === 'done' ? 'Done' : 'Pending', description: `Room ${room.room_number}` });
      }
    } else {
      const { error } = await supabase.from('inventory_pillow_protector').insert({
        room_id: room.id,
        status: 'done',
        done_by: user.id,
        done_at: new Date().toISOString(),
        period_month: periodMonth,
        period_year: periodYear,
        created_by: user.id,
      });
      if (error) {
        toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Done', description: `Room ${room.room_number}` });
      }
    }
    setUpdating(null);
    fetchData();
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  async function handleSyncToSheet() {
    setSyncing(true);
    setLastSync(null);
    try {
      const { data: projectData } = await supabase
        .from('special_projects')
        .select('id, project_name, month, year')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!projectData) {
        toast({ title: 'Tidak ada project', description: 'Buat minimal 1 project di Special Cleaning dulu.', variant: 'destructive' });
        setSyncing(false);
        return;
      }

      const res = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectData.id,
          projectName: projectData.project_name,
          month: projectData.month,
          year: projectData.year,
          mode: 'write',
          type: 'pillow-protector',
        }),
      });
      const data: SyncResult = await res.json();
      setLastSync(data);
      if (data.success) {
        toast({ title: 'Synced to Sheet', description: `${data.roomsWritten} rooms → "${data.sheetName}"` });
      } else {
        toast({ title: 'Sync gagal', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      setLastSync({ success: false, error: e.message });
      toast({ title: 'Sync gagal', description: e.message, variant: 'destructive' });
    }
    setSyncing(false);
  }

  // Stats
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    let done = 0;
    let pending = 0;
    rooms.forEach((r) => {
      const pp = r.pillow_protector?.[0];
      if (pp?.status === 'done') done++;
      else pending++;
    });
    const progress = totalRooms > 0 ? Math.round((done / totalRooms) * 100) : 0;
    return { totalRooms, done, pending, progress };
  }, [rooms]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pillow Protector"
        description="Track pembersihan Pillow Protector per kamar. Klik kamar untuk toggle Done/Pending."
        action={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncToSheet} disabled={syncing}>
                <Sheet className={`mr-2 h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Sheet'}
              </Button>
            </div>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Done', value: stats.done, total: stats.totalRooms, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: stats.pending, total: stats.totalRooms, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Rooms', value: stats.totalRooms, total: null, icon: Shield, color: 'text-navy', bg: 'bg-muted' },
          { label: 'Progress', value: `${stats.progress}%`, total: null, icon: RefreshCw, color: 'text-gold-foreground', bg: 'bg-gold/10' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <Card className="card-shadow-lg">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold">
                      {stat.value}
                      {stat.total !== null && <span className="text-sm font-normal text-muted-foreground"> / {stat.total}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Sync result banner */}
      {lastSync && (
        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${lastSync.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <Sheet className={`h-5 w-5 flex-shrink-0 mt-0.5 ${lastSync.success ? 'text-emerald-600' : 'text-red-600'}`} />
          <div className="flex-1">
            {lastSync.success ? (
              <>
                <p className="font-medium text-emerald-900">Synced! {lastSync.roomsWritten} rooms → &quot;{lastSync.sheetName}&quot;</p>
                {lastSync.spreadsheetUrl && (
                  <a href={lastSync.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline">
                    Open spreadsheet <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            ) : (
              <p className="text-red-900">{lastSync.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Period selector */}
      <Card className="card-shadow-lg">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium">Periode:</span>
          <select value={periodMonth} onChange={(e) => setPeriodMonth(parseInt(e.target.value))} className="rounded-md border bg-background px-3 py-1.5 text-sm">
            {MONTH_NAMES.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
          </select>
          <input type="number" value={periodYear} onChange={(e) => setPeriodYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-20 rounded-md border bg-background px-3 py-1.5 text-sm" />
        </CardContent>
      </Card>

      {/* Room table grouped by Section → Floor */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/50" />
          ))}
        </div>
      ) : sectionGroups.length === 0 ? (
        <Card className="card-shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground">No rooms found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sectionGroups.map((secGroup) => (
            <div key={secGroup.section} className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gold" />
                <h2 className="font-display text-lg font-semibold">Section Gedung {secGroup.section}</h2>
              </div>

              {secGroup.floors.map((floorGroup) => {
                const collapseKey = `${secGroup.section}|${floorGroup.floor}`;
                const isCollapsed = collapsed[collapseKey] ?? false;
                const floorDone = floorGroup.rooms.filter((r) => r.pillow_protector?.[0]?.status === 'done').length;
                const floorProgress = floorGroup.rooms.length > 0 ? Math.round((floorDone / floorGroup.rooms.length) * 100) : 0;

                return (
                  <Card key={collapseKey} className="card-shadow-lg overflow-hidden">
                    <button onClick={() => toggleCollapse(collapseKey)} className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="font-medium">FLOOR {floorGroup.floor} {secGroup.section}</span>
                        <Badge variant="outline" className="text-xs">{floorGroup.rooms.length} rooms</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{floorDone}/{floorGroup.rooms.length} done</span>
                        <div className="w-20"><Progress value={floorProgress} className="h-2 [&>div]:gold-gradient" /></div>
                        <span className="w-10 text-right">{floorProgress}%</span>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/20">
                            <tr className="text-left">
                              <th className="px-4 py-2 font-medium">Room</th>
                              <th className="px-4 py-2 font-medium">Type</th>
                              <th className="px-4 py-2 font-medium">Status</th>
                              <th className="px-4 py-2 font-medium">Done By</th>
                              <th className="px-4 py-2 font-medium">Date</th>
                              <th className="px-4 py-2 text-right font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {floorGroup.rooms.map((room) => {
                              const pp = room.pillow_protector?.[0];
                              const isDone = pp?.status === 'done';
                              const isUpdating = updating === room.id;
                              return (
                                <tr key={room.id} className={`border-b last:border-0 ${isDone ? 'bg-emerald-50/40' : ''}`}>
                                  <td className="px-4 py-2 font-display font-bold">{room.room_number}</td>
                                  <td className="px-4 py-2">
                                    <Badge variant="outline" className="text-xs">
                                      {Array.isArray(room.room_types) ? room.room_types[0]?.name ?? '—' : room.room_types?.name ?? '—'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2">
                                    {isDone ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" /> Done</Badge>
                                    ) : (
                                      <Badge variant="outline"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">{pp?.profiles?.name ?? '—'}</td>
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {pp?.done_at ? new Date(pp.done_at).toLocaleDateString('en-US') : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <Button
                                      size="sm"
                                      variant={isDone ? 'outline' : 'default'}
                                      disabled={!canEdit || isUpdating}
                                      onClick={() => toggleDone(room)}
                                      className={isDone ? '' : 'gold-gradient text-navy hover:opacity-90'}
                                    >
                                      {isUpdating ? '...' : isDone ? 'Undo' : 'Done'}
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!canEdit && (
        <p className="text-center text-sm text-muted-foreground">View-only access. Switch to admin or supervisor to update status.</p>
      )}
    </div>
  );
}
