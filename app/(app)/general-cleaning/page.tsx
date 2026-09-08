'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Search,
  Calendar,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Building2,
  Wrench,
  Brush,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { Room, GeneralCleaning } from '@/lib/types';

interface RoomWithGC extends Omit<Room, 'room_types'> {
  general_cleaning: GeneralCleaning[];
  room_types?: { id: string; name: string } | null;
}

interface SectionGroup {
  section: string;
  floors: { floor: number; rooms: RoomWithGC[] }[];
}

export default function GeneralCleaningPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomWithGC[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const isManager = profile?.role === 'manager';
  const canToggle = isSupervisor || isAdmin || isManager;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    // Fetch rooms & GC separately so rooms still load even if GC query fails
    const roomsRes = await supabase
      .from('rooms')
      .select('id, room_number, room_type_id, section, floor, created_at, room_types(id, name)')
      .order('room_number', { ascending: true });

    const gcRes = await supabase
      .from('general_cleaning')
      .select('id, room_id, status, done_hk, done_eng, completed_by, completed_at, date, notes, profiles(name)')
      .eq('date', selectedDate);

    // Surface GC errors with a clear banner so the user knows migration is missing
    if (gcRes.error) {
      console.error('GC fetch error:', gcRes.error);
      const msg = gcRes.error.message || '';
      const code = (gcRes.error as any)?.code || '';
      const hint = `[${code}] ${msg}

Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(not set)'}

Possible causes:
1. Migration belum di-run di Supabase project yang BENAR (cek URL di atas vs URL di Supabase dashboard)
2. PostgREST schema cache belum reload (tunggu 1 menit setelah run SQL, lalu hard refresh)
3. Kamu mengakses preview URL lama (bukan production URL) — cek Vercel dashboard untuk production URL

Run SQL ini di Supabase SQL Editor project yang BENAR:
https://raw.githubusercontent.com/putrierviyanti29-beep/RoomProject/main/supabase/migrations/20260908060003_all_in_one_fix.sql`;
      setFetchError(hint);
      toast({
        title: 'Gagal memuat data cleaning',
        description: `[${code}] ${msg}`,
        variant: 'destructive',
      });
    }

    const gcByRoom = new Map<string, GeneralCleaning>();
    (gcRes.data ?? []).forEach((g) => {
      gcByRoom.set(g.room_id, g as unknown as GeneralCleaning);
    });

    const merged = ((roomsRes.data ?? []) as unknown as RoomWithGC[]).map((r) => {
      const roomGc = gcByRoom.get(r.id);
      return {
        ...r,
        room_types: Array.isArray((r as any).room_types) ? (r as any).room_types[0] ?? null : (r as any).room_types,
        general_cleaning: roomGc ? [roomGc] : [],
      };
    });

    setRooms(merged);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group rooms by section → floor
  const sectionGroups: SectionGroup[] = useMemo(() => {
    const filtered = rooms.filter((r) =>
      r.room_number.toLowerCase().includes(search.toLowerCase())
    );
    const sectionMap = new Map<string, SectionGroup>();
    filtered.forEach((r) => {
      const sec = r.section ?? 'Unassigned';
      if (!sectionMap.has(sec)) {
        sectionMap.set(sec, { section: sec, floors: [] });
      }
      const secGroup = sectionMap.get(sec)!;
      const fl = r.floor ?? 0;
      let floorGroup = secGroup.floors.find((f) => f.floor === fl);
      if (!floorGroup) {
        floorGroup = { floor: fl, rooms: [] };
        secGroup.floors.push(floorGroup);
      }
      floorGroup.rooms.push(r);
    });
    return Array.from(sectionMap.values())
      .sort((a, b) => a.section.localeCompare(b.section))
      .map((g) => ({
        ...g,
        floors: g.floors.sort((a, b) => a.floor - b.floor),
      }));
  }, [rooms, search]);

  // Toggle HK or ENG independently. Both can be true at the same time.
  async function toggleDone(room: RoomWithGC, type: 'hk' | 'eng') {
    if (!user) {
      toast({ title: 'Not logged in', description: 'Please sign in to update cleaning status.', variant: 'destructive' });
      return;
    }
    if (!canToggle) {
      toast({ title: 'No permission', description: 'Your role does not allow updating cleaning status.', variant: 'destructive' });
      return;
    }
    const existing = room.general_cleaning[0];
    setUpdating(room.id);

    const columnKey = type === 'hk' ? 'done_hk' : 'done_eng';
    const label = type === 'hk' ? 'Housekeeping' : 'Engineering';

    if (existing) {
      // Toggle the boolean
      const newValue = type === 'hk' ? !existing.done_hk : !existing.done_eng;
      const otherDone = type === 'hk' ? existing.done_eng : existing.done_hk;
      const newStatus = newValue || otherDone ? 'done' : 'pending';

      const { error } = await supabase
        .from('general_cleaning')
        .update({
          [columnKey]: newValue,
          status: newStatus,
          completed_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error('GC toggle error:', error);
        toast({ title: 'Gagal update', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: newValue ? `${label} done` : `${label} cleared`,
          description: `Room ${room.room_number}`,
        });
      }
    } else {
      // Insert new record
      const { error } = await supabase.from('general_cleaning').insert({
        room_id: room.id,
        status: 'done',
        done_hk: type === 'hk',
        done_eng: type === 'eng',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: selectedDate,
      });
      if (error) {
        console.error('GC insert error:', error);
        toast({ title: 'Gagal insert', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: `${label} done`,
          description: `Room ${room.room_number}`,
        });
      }
    }
    setUpdating(null);
    fetchData();
  }

  // Clear both HK & ENG → back to pending
  async function clearRoom(room: RoomWithGC) {
    if (!user) {
      toast({ title: 'Not logged in', description: 'Please sign in.', variant: 'destructive' });
      return;
    }
    if (!canToggle) {
      toast({ title: 'No permission', description: 'Your role does not allow this.', variant: 'destructive' });
      return;
    }
    const existing = room.general_cleaning[0];
    if (!existing) return;
    setUpdating(room.id);
    const { error } = await supabase
      .from('general_cleaning')
      .update({
        status: 'pending',
        done_hk: false,
        done_eng: false,
        completed_by: null,
        completed_at: null,
        notes: null,
      })
      .eq('id', existing.id);
    if (error) {
      console.error('GC clear error:', error);
      toast({ title: 'Gagal clear', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cleared', description: `Room ${room.room_number} reset to pending.` });
    }
    setUpdating(null);
    fetchData();
  }

  // Summary stats — HK & ENG counted independently (a room done by both counts in both)
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    let doneHK = 0;
    let doneEng = 0;
    let doneBoth = 0;
    let issue = 0;
    rooms.forEach((r) => {
      const g = r.general_cleaning[0];
      if (g?.status === 'issue') {
        issue++;
        return;
      }
      const hk = !!g?.done_hk;
      const eng = !!g?.done_eng;
      if (hk && eng) {
        doneHK++;
        doneEng++;
        doneBoth++;
      } else if (hk) {
        doneHK++;
      } else if (eng) {
        doneEng++;
      }
    });
    const done = doneHK + doneEng - doneBoth; // rooms done by either
    const pending = totalRooms - done - issue;
    const progress = totalRooms > 0 ? Math.round((done / totalRooms) * 100) : 0;
    return { totalRooms, done, doneHK, doneEng, doneBoth, issue, pending, progress };
  }, [rooms]);

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Cleaning"
        description="Daily room cleaning checklist. Mark each room as Done by Housekeeping or Done by Engineering."
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* DB error banner — shown when GC query fails (e.g. migration not run) */}
      {fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-900">Database belum siap untuk fitur baru</p>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-amber-100/60 p-2 text-xs text-amber-900 font-mono overflow-auto max-h-60">
{fetchError}
            </pre>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-amber-700 underline">
                Lihat cara fix
              </summary>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-amber-800">
                <li>
                  Buka Supabase dashboard → pastikan URL di sidebar (mis. <code className="rounded bg-amber-100 px-1">vysxzxnhdbufeflfuoqz</code>) SAMA dengan URL di banner error di atas
                </li>
                <li>
                  Buka link SQL ini di tab baru → copy semua isinya:
                  <br />
                  <code className="mt-1 block rounded bg-amber-100 px-2 py-1 text-[10px] break-all">
                    https://raw.githubusercontent.com/putrierviyanti29-beep/RoomProject/main/supabase/migrations/20260908060003_all_in_one_fix.sql
                  </code>
                </li>
                <li>Supabase → <strong>SQL Editor</strong> → <strong>New query</strong> → paste → klik <strong>Run</strong></li>
                <li>Tunggu sampai <em>&quot;Success. No rows returned&quot;</em></li>
                <li>Tunggu 30 detik (PostgREST cache reload)</li>
                <li>Buka URL <strong>PRODUCTION</strong> Vercel (bukan preview URL) — cek di Vercel dashboard</li>
                <li>Hard refresh: <strong>Ctrl+Shift+R</strong> (Windows) atau <strong>Cmd+Shift+R</strong> (Mac)</li>
              </ol>
            </details>
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} disabled={loading} className="flex-shrink-0">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: 'Done (HK)', value: stats.doneHK, icon: Brush, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Done (Eng)', value: stats.doneEng, icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Issues', value: stats.issue, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Progress', value: `${stats.progress}%`, icon: RefreshCw, color: 'text-navy', bg: 'bg-muted' },
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

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search room number..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            className="pl-10 sm:w-auto"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

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
                const floorDone = floorGroup.rooms.filter(
                  (r) => r.general_cleaning[0]?.status === 'done'
                ).length;
                const floorProgress =
                  floorGroup.rooms.length > 0
                    ? Math.round((floorDone / floorGroup.rooms.length) * 100)
                    : 0;

                return (
                  <Card key={collapseKey} className="card-shadow-lg overflow-hidden">
                    <button
                      onClick={() => toggleCollapse(collapseKey)}
                      className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <span className="font-medium">
                          FLOOR {floorGroup.floor} {secGroup.section}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {floorGroup.rooms.length} rooms
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>
                          {floorDone}/{floorGroup.rooms.length} done
                        </span>
                        <div className="w-20">
                          <Progress value={floorProgress} className="h-2 [&>div]:gold-gradient" />
                        </div>
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
                              <th className="px-4 py-2 font-medium">Time</th>
                              <th className="px-4 py-2 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {floorGroup.rooms.map((room) => {
                              const gc = room.general_cleaning[0];
                              const status = gc?.status;
                              const hkDone = !!gc?.done_hk;
                              const engDone = !!gc?.done_eng;
                              const isDone = hkDone || engDone;
                              const isIssue = status === 'issue';
                              const isUpdating = updating === room.id;
                              return (
                                <tr
                                  key={room.id}
                                  className={`border-b last:border-0 ${
                                    hkDone && engDone
                                      ? 'bg-purple-50/40'
                                      : hkDone
                                      ? 'bg-emerald-50/40'
                                      : engDone
                                      ? 'bg-blue-50/40'
                                      : isIssue
                                      ? 'bg-red-50/30'
                                      : ''
                                  }`}
                                >
                                  <td className="px-4 py-2 font-display font-bold">{room.room_number}</td>
                                  <td className="px-4 py-2">
                                    <Badge variant="outline" className="text-xs">
                                      {Array.isArray(room.room_types)
                                        ? room.room_types[0]?.name ?? '—'
                                        : room.room_types?.name ?? '—'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                      {hkDone && (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                          <Brush className="mr-1 h-3 w-3" /> HK
                                        </Badge>
                                      )}
                                      {engDone && (
                                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                          <Wrench className="mr-1 h-3 w-3" /> Eng
                                        </Badge>
                                      )}
                                      {isIssue && (
                                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                          <AlertTriangle className="mr-1 h-3 w-3" /> Issue
                                        </Badge>
                                      )}
                                      {!isDone && !isIssue && (
                                        <Badge variant="outline">
                                          <Clock className="mr-1 h-3 w-3" /> Pending
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {gc?.profiles?.name ?? '—'}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {gc?.completed_at
                                      ? new Date(gc.completed_at).toLocaleTimeString('en-US', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!canToggle || isUpdating}
                                        onClick={() => toggleDone(room, 'hk')}
                                        className={`h-7 px-2 text-xs ${
                                          hkDone
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : ''
                                        }`}
                                        title="Toggle Housekeeping done"
                                      >
                                        <Brush className="mr-1 h-3 w-3" /> HK
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!canToggle || isUpdating}
                                        onClick={() => toggleDone(room, 'eng')}
                                        className={`h-7 px-2 text-xs ${
                                          engDone
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : ''
                                        }`}
                                        title="Toggle Engineering done"
                                      >
                                        <Wrench className="mr-1 h-3 w-3" /> Eng
                                      </Button>
                                      {(isDone || isIssue) && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={!canToggle || isUpdating}
                                          onClick={() => clearRoom(room)}
                                          className="h-7 px-2 text-xs text-muted-foreground"
                                          title="Reset both HK & ENG to pending"
                                        >
                                          Clear
                                        </Button>
                                      )}
                                    </div>
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

      {!canToggle && (
        <p className="text-center text-sm text-muted-foreground">
          You have view-only access. Switch to a supervisor, manager, or admin account to update cleaning status.
        </p>
      )}

      {/* Info card explaining the workflow */}
      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">How to use:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              Click <strong>HK</strong> to mark the room as <strong>Done by Housekeeping</strong> (green).
            </li>
            <li>
              Click <strong>Eng</strong> to mark the room as <strong>Done by Engineering</strong> (blue).
            </li>
            <li>Click the same button again to toggle back to pending.</li>
            <li>
              Click <strong>Clear</strong> to reset the room to pending (removes done status &amp; assignee).
            </li>
            <li>Status syncs to the spreadsheet as &quot;done&quot; on the selected date.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
