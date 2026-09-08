'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Room, GeneralCleaning, InspectionArea, CleaningStatus } from '@/lib/types';

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
  const [areas, setAreas] = useState<InspectionArea[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [issueDialog, setIssueDialog] = useState<{ roomId: string; areaId: string; roomNumber: string; areaName: string } | null>(null);
  const [issueNotes, setIssueNotes] = useState('');

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const isManager = profile?.role === 'manager';
  const canToggle = isSupervisor || isAdmin || isManager;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [roomsRes, gcRes, areasRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, room_number, room_type_id, section, floor, created_at, room_types(id, name)')
        .order('room_number', { ascending: true }),
      supabase
        .from('general_cleaning')
        .select('id, room_id, status, completed_by, completed_at, date, notes, area_id, profiles(name, email), inspection_areas(id, name)')
        .eq('date', selectedDate),
      supabase
        .from('inspection_areas')
        .select('id, name, display_order, is_active, created_at')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ]);

    // Group GC records by (room_id, area_id) — supports multi-area per room
    const gcByKey = new Map<string, GeneralCleaning>();
    (gcRes.data ?? []).forEach((g) => {
      const key = `${g.room_id}|${g.area_id ?? 'null'}`;
      gcByKey.set(key, g as unknown as GeneralCleaning);
    });

    const merged = ((roomsRes.data ?? []) as unknown as RoomWithGC[]).map((r) => {
      const roomGc = Array.from(gcByKey.values()).filter((g) => g.room_id === r.id);
      return {
        ...r,
        room_types: Array.isArray((r as any).room_types) ? (r as any).room_types[0] ?? null : (r as any).room_types,
        general_cleaning: roomGc,
      };
    });

    setRooms(merged);
    setAreas(areasRes.data ?? []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group rooms by section → floor (matching spreadsheet structure)
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
    // Sort sections alphabetically, floors numerically
    return Array.from(sectionMap.values())
      .sort((a, b) => a.section.localeCompare(b.section))
      .map((g) => ({
        ...g,
        floors: g.floors.sort((a, b) => a.floor - b.floor),
      }));
  }, [rooms, search]);

  async function toggleCleaning(room: RoomWithGC, area: InspectionArea) {
    if (!user || !canToggle) return;
    const existing = room.general_cleaning.find((g) => g.area_id === area.id);
    setUpdating(`${room.id}|${area.id}`);

    if (existing) {
      const newStatus: CleaningStatus = existing.status === 'done' ? 'pending' : 'done';
      const { error } = await supabase
        .from('general_cleaning')
        .update({
          status: newStatus,
          completed_by: newStatus === 'done' ? user.id : null,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null,
          notes: newStatus === 'done' ? existing.notes : existing.notes,
        })
        .eq('id', existing.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: newStatus === 'done' ? 'Marked as done' : 'Marked as pending',
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchData();
      }
    } else {
      const { error } = await supabase.from('general_cleaning').insert({
        room_id: room.id,
        area_id: area.id,
        status: 'done',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: selectedDate,
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: 'Marked as done',
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchData();
      }
    }
    setUpdating(null);
  }

  async function saveIssue() {
    if (!issueDialog || !user) return;
    const { roomId, areaId } = issueDialog;
    const room = rooms.find((r) => r.id === roomId);
    const existing = room?.general_cleaning.find((g) => g.area_id === areaId);

    setUpdating(`${roomId}|${areaId}`);
    if (existing) {
      const { error } = await supabase
        .from('general_cleaning')
        .update({
          status: 'issue',
          notes: issueNotes.trim() || null,
          completed_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Issue logged', description: `Room ${room?.room_number} — notes saved.`, variant: 'destructive' });
        fetchData();
      }
    } else {
      const { error } = await supabase.from('general_cleaning').insert({
        room_id: roomId,
        area_id: areaId,
        status: 'issue',
        notes: issueNotes.trim() || null,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: selectedDate,
      });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Issue logged', description: `Room ${room?.room_number} — notes saved.`, variant: 'destructive' });
        fetchData();
      }
    }
    setUpdating(null);
    setIssueDialog(null);
    setIssueNotes('');
  }

  // Summary stats
  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const totalAreas = totalRooms * areas.length;
    let done = 0;
    let issue = 0;
    rooms.forEach((r) => {
      areas.forEach((a) => {
        const g = r.general_cleaning.find((gc) => gc.area_id === a.id);
        if (g?.status === 'done') done++;
        else if (g?.status === 'issue') issue++;
      });
    });
    const pending = totalAreas - done - issue;
    const progress = totalAreas > 0 ? Math.round((done / totalAreas) * 100) : 0;
    return { totalRooms, totalAreas, done, issue, pending, progress };
  }, [rooms, areas]);

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function getAreaStatus(room: RoomWithGC, areaId: string): GeneralCleaning | undefined {
    return room.general_cleaning.find((g) => g.area_id === areaId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Cleaning"
        description="Daily room cleaning checklist grouped by section & floor — matches the spreadsheet template."
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Rooms Done', value: stats.done, total: stats.totalAreas, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: stats.pending, total: stats.totalAreas, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Issues', value: stats.issue, total: stats.totalAreas, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Progress', value: `${stats.progress}%`, total: null, icon: RefreshCw, color: 'text-navy', bg: 'bg-muted' },
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

      {/* Inspection areas legend */}
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <Badge key={a.id} variant="outline" className="gap-1.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" />
              {a.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Room grid grouped by Section → Floor (matching spreadsheet) */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/50" />
          ))}
        </div>
      ) : sectionGroups.length === 0 ? (
        <Card className="card-shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground">No rooms found. Import rooms first in Room Management.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sectionGroups.map((secGroup) => (
            <div key={secGroup.section} className="space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gold" />
                <h2 className="font-display text-lg font-semibold">Section Gedung {secGroup.section}</h2>
              </div>

              {/* Floors */}
              {secGroup.floors.map((floorGroup) => {
                const collapseKey = `${secGroup.section}|${floorGroup.floor}`;
                const isCollapsed = collapsed[collapseKey] ?? false;
                const floorDone = floorGroup.rooms.reduce(
                  (acc, r) => acc + areas.filter((a) => getAreaStatus(r, a.id)?.status === 'done').length,
                  0
                );
                const floorTotal = floorGroup.rooms.length * areas.length;
                const floorProgress = floorTotal > 0 ? Math.round((floorDone / floorTotal) * 100) : 0;

                return (
                  <Card key={collapseKey} className="card-shadow-lg overflow-hidden">
                    <button
                      onClick={() => toggleCollapse(collapseKey)}
                      className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="font-medium">FLOOR {floorGroup.floor} {secGroup.section}</span>
                        <Badge variant="outline" className="text-xs">{floorGroup.rooms.length} rooms</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{floorDone}/{floorTotal} done</span>
                        <div className="w-20">
                          <Progress value={floorProgress} className="h-2 [&>div]:gold-gradient" />
                        </div>
                        <span className="w-10 text-right">{floorProgress}%</span>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <CardContent className="p-0">
                            <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-2 xl:grid-cols-3">
                              {floorGroup.rooms.map((room) => (
                                <RoomCard
                                  key={room.id}
                                  room={room}
                                  areas={areas}
                                  canToggle={canToggle}
                                  updating={updating}
                                  onToggle={(area) => toggleCleaning(room, area)}
                                  onIssue={(area) => {
                                    setIssueDialog({
                                      roomId: room.id,
                                      areaId: area.id,
                                      roomNumber: room.room_number,
                                      areaName: area.name,
                                    });
                                    const existing = room.general_cleaning.find((g) => g.area_id === area.id);
                                    setIssueNotes(existing?.notes ?? '');
                                  }}
                                />
                              ))}
                            </div>
                          </CardContent>
                        </motion.div>
                      )}
                    </AnimatePresence>
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

      {/* Issue dialog */}
      <Dialog open={!!issueDialog} onOpenChange={(open) => !open && setIssueDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Log Issue
            </DialogTitle>
            <DialogDescription>
              Room <strong>{issueDialog?.roomNumber}</strong> — {issueDialog?.areaName}. Describe the issue for follow-up.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g. Light bulb broken in bathroom, needs replacement..."
            value={issueNotes}
            onChange={(e) => setIssueNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={saveIssue}>Save Issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// RoomCard component — renders one room with all its inspection areas
// ============================================================================
interface RoomCardProps {
  room: RoomWithGC;
  areas: InspectionArea[];
  canToggle: boolean;
  updating: string | null;
  onToggle: (area: InspectionArea) => void;
  onIssue: (area: InspectionArea) => void;
}

function RoomCard({ room, areas, canToggle, updating, onToggle, onIssue }: RoomCardProps) {
  const doneCount = areas.filter((a) => room.general_cleaning.find((g) => g.area_id === a.id && g.status === 'done')).length;
  const issueCount = areas.filter((a) => room.general_cleaning.find((g) => g.area_id === a.id && g.status === 'issue')).length;
  const allDone = areas.length > 0 && doneCount === areas.length;
  const hasIssue = issueCount > 0;

  return (
    <div
      className={`bg-card p-4 transition-colors ${
        allDone ? 'bg-emerald-50/40' : hasIssue ? 'bg-red-50/30' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-display text-xl font-bold">{room.room_number}</p>
          <Badge variant="outline" className="mt-1 text-xs">
            {Array.isArray(room.room_types) ? room.room_types[0]?.name ?? '—' : room.room_types?.name ?? 'Unassigned'}
          </Badge>
        </div>
        <div className="text-right text-xs">
          <p className="font-medium">
            {doneCount}/{areas.length} done
          </p>
          {issueCount > 0 && <p className="text-red-600">{issueCount} issue{issueCount > 1 ? 's' : ''}</p>}
        </div>
      </div>

      {/* Areas checklist */}
      <div className="space-y-1.5">
        {areas.map((area) => {
          const gc = room.general_cleaning.find((g) => g.area_id === area.id);
          const status = gc?.status;
          const isUpdating = updating === `${room.id}|${area.id}`;
          return (
            <div
              key={area.id}
              className={`flex items-center gap-2 rounded-md border p-2 text-sm transition-all ${
                status === 'done'
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : status === 'issue'
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-border'
              }`}
            >
              <button
                disabled={!canToggle || isUpdating}
                onClick={() => canToggle && onToggle(area)}
                className={`flex h-5 w-5 items-center justify-center rounded border transition-all disabled:opacity-50 ${
                  status === 'done'
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-muted-foreground/30 bg-background'
                }`}
              >
                {status === 'done' && <CheckCircle2 className="h-3 w-3" />}
              </button>
              <span className="flex-1 truncate">{area.name}</span>
              {status === 'done' && gc?.completed_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(gc.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {status === 'issue' && (
                <button
                  disabled={!canToggle || isUpdating}
                  onClick={() => canToggle && onIssue(area)}
                  className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Issue
                </button>
              )}
              {canToggle && status !== 'done' && status !== 'issue' && (
                <button
                  disabled={isUpdating}
                  onClick={() => onIssue(area)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                  title="Log issue"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Show notes preview if any */}
      {room.general_cleaning.some((g) => g.notes) && (
        <div className="mt-2 space-y-1">
          {room.general_cleaning
            .filter((g) => g.notes)
            .map((g) => (
              <p key={g.id} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                <strong>{g.inspection_areas?.name ?? 'Area'}:</strong> {g.notes}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
