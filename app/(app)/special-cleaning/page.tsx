'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { SpecialProject, InspectionArea, SpecialCleaning } from '@/lib/types';
import { MONTH_NAMES } from '@/lib/types';

interface RoomLite {
  id: string;
  room_number: string;
  section: string | null;
  floor: number | null;
  room_types?: { id: string; name: string } | null;
}

interface RoomWithSC extends RoomLite {
  special_cleaning: SpecialCleaning[];
}

interface SectionGroup {
  section: string;
  floors: { floor: number; rooms: RoomWithSC[] }[];
}

export default function SpecialCleaningPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const isManager = profile?.role === 'manager';
  const canToggle = isSupervisor || isAdmin || isManager;

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<SpecialProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<SpecialProject | null>(null);
  const [areas, setAreas] = useState<InspectionArea[]>([]);
  const [rooms, setRooms] = useState<RoomWithSC[]>([]);
  const [scLoading, setScLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectMonth, setNewProjectMonth] = useState((new Date().getMonth() + 1).toString());
  const [newProjectYear, setNewProjectYear] = useState(new Date().getFullYear().toString());
  const [deleteProject, setDeleteProject] = useState<SpecialProject | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('special_projects')
      .select('id, project_name, month, year, created_at')
      .order('created_at', { ascending: false });
    setProjects(data ?? []);
    if (data && data.length > 0 && !selectedProject) {
      setSelectedProject(data[0]);
    }
    setLoading(false);
  }, [selectedProject]);

  const fetchAreas = useCallback(async () => {
    const { data } = await supabase
      .from('inspection_areas')
      .select('id, name, display_order, is_active, created_at')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    setAreas(data ?? []);
  }, []);

  const fetchRoomsAndSC = useCallback(async () => {
    if (!selectedProject) {
      setRooms([]);
      return;
    }
    setScLoading(true);
    const [roomsRes, scRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, room_number, section, floor, room_types(id, name)')
        .order('room_number', { ascending: true }),
      supabase
        .from('special_cleaning')
        .select('id, project_id, room_id, area_id, status, done_type, completed_by, completed_at, notes, date, profiles(name), inspection_areas(id, name)')
        .eq('project_id', selectedProject.id),
    ]);

    const scByRoomArea = new Map<string, SpecialCleaning>();
    (scRes.data ?? []).forEach((s) => {
      const key = `${s.room_id}|${s.area_id}`;
      scByRoomArea.set(key, s as unknown as SpecialCleaning);
    });

    const merged = ((roomsRes.data ?? []) as any[]).map((r) => {
      const roomSc = Array.from(scByRoomArea.values()).filter((s) => s.room_id === r.id);
      return {
        ...r,
        room_types: Array.isArray(r.room_types) ? r.room_types[0] ?? null : r.room_types,
        special_cleaning: roomSc,
      } as RoomWithSC;
    });
    setRooms(merged);
    setScLoading(false);
  }, [selectedProject]);

  useEffect(() => {
    fetchProjects();
    fetchAreas();
  }, [fetchProjects, fetchAreas]);

  useEffect(() => {
    fetchRoomsAndSC();
  }, [fetchRoomsAndSC]);

  const sectionGroups: SectionGroup[] = useMemo(() => {
    const filtered = rooms.filter((r) =>
      r.room_number.toLowerCase().includes(search.toLowerCase())
    );
    const sectionMap = new Map<string, SectionGroup>();
    filtered.forEach((r) => {
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
  }, [rooms, search]);

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const { error } = await supabase.from('special_projects').insert({
      project_name: newProjectName.trim(),
      month: parseInt(newProjectMonth),
      year: parseInt(newProjectYear),
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: 'Project Created',
        description: `${newProjectName} — 4 inspection areas × all rooms auto-generated.`,
      });
      setNewProjectName('');
      setProjectDialogOpen(false);
      fetchProjects();
    }
  }

  async function handleDeleteProject() {
    if (!deleteProject) return;
    const { error } = await supabase.from('special_projects').delete().eq('id', deleteProject.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Project Deleted', description: `${deleteProject.project_name} has been removed.` });
      if (selectedProject?.id === deleteProject.id) setSelectedProject(null);
      setDeleteProject(null);
      fetchProjects();
    }
  }

  async function toggleArea(room: RoomWithSC, area: InspectionArea) {
    if (!user || !canToggle) return;
    const existing = room.special_cleaning.find((s) => s.area_id === area.id);
    setUpdating(`${room.id}|${area.id}`);

    if (existing) {
      const newStatus = existing.status === 'done' ? 'pending' : 'done';
      const { error } = await supabase
        .from('special_cleaning')
        .update({
          status: newStatus,
          done_type: newStatus === 'done' ? (existing.done_type ?? 'housekeeping') : null,
          completed_by: user.id,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: newStatus === 'done' ? 'Marked as done' : 'Marked as pending',
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchRoomsAndSC();
      }
    } else {
      // Fallback: insert manually if trigger didn't fire
      const { error } = await supabase.from('special_cleaning').insert({
        project_id: selectedProject!.id,
        room_id: room.id,
        area_id: area.id,
        status: 'done',
        done_type: 'housekeeping',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
      });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Marked as done', description: `Room ${room.room_number} — ${area.name}` });
        fetchRoomsAndSC();
      }
    }
    setUpdating(null);
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  const stats = useMemo(() => {
    const totalRooms = rooms.length;
    const totalAreas = totalRooms * areas.length;
    let done = 0;
    let issue = 0;
    rooms.forEach((r) => {
      areas.forEach((a) => {
        const s = r.special_cleaning.find((sc) => sc.area_id === a.id);
        if (s?.status === 'done') done++;
        else if (s?.status === 'issue') issue++;
      });
    });
    const pending = totalAreas - done - issue;
    const progress = totalAreas > 0 ? Math.round((done / totalAreas) * 100) : 0;
    return { totalRooms, totalAreas, done, issue, pending, progress };
  }, [rooms, areas]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Special Cleaning"
        description="Monthly special cleaning projects. Each project auto-generates a grid of 4 inspection areas × all rooms."
        action={
          isAdmin && (
            <Button size="sm" onClick={() => setProjectDialogOpen(true)} className="gold-gradient text-navy hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          )
        }
      />

      {/* Project selector + summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Active Project</Label>
          <Select
            value={selectedProject?.id ?? ''}
            onValueChange={(v) => {
              const p = projects.find((p) => p.id === v);
              setSelectedProject(p ?? null);
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.project_name} — {MONTH_NAMES[p.month - 1]} {p.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedProject && isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setDeleteProject(selectedProject)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Project
          </Button>
        )}
      </div>

      {!selectedProject ? (
        <Card className="card-shadow-lg">
          <CardContent className="flex h-64 flex-col items-center justify-center gap-3">
            <Sparkles className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? 'No projects yet. Click "New Project" to create one.'
                : 'Select a project above to view its inspection grid.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Done', value: stats.done, total: stats.totalAreas, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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
                          {stat.total !== null && (
                            <span className="text-sm font-normal text-muted-foreground"> / {stat.total}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Search + areas legend */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:max-w-xs flex-1">
              <Input
                placeholder="Search room number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          </div>

          {/* Room grid grouped by Section → Floor */}
          {scLoading ? (
            <div className="space-y-2">
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
                    const floorDone = floorGroup.rooms.reduce(
                      (acc, r) => acc + areas.filter((a) => r.special_cleaning.find((s) => s.area_id === a.id && s.status === 'done')).length,
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
                              <div className="overflow-x-auto p-0">
                                <table className="w-full text-sm">
                                  <thead className="border-b bg-muted/20">
                                    <tr className="text-left">
                                      <th className="px-4 py-2 font-medium">Room</th>
                                      <th className="px-4 py-2 font-medium">Type</th>
                                      {areas.map((a) => (
                                        <th key={a.id} className="px-3 py-2 font-medium text-center">
                                          {a.name}
                                        </th>
                                      ))}
                                      <th className="px-4 py-2 font-medium text-center">Progress</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {floorGroup.rooms.map((room) => {
                                      const roomDone = areas.filter((a) =>
                                        room.special_cleaning.find((s) => s.area_id === a.id && s.status === 'done')
                                      ).length;
                                      const roomProgress = areas.length > 0 ? Math.round((roomDone / areas.length) * 100) : 0;
                                      const allDone = areas.length > 0 && roomDone === areas.length;

                                      return (
                                        <tr
                                          key={room.id}
                                          className={`border-b last:border-0 ${allDone ? 'bg-emerald-50/30' : ''}`}
                                        >
                                          <td className="px-4 py-2 font-display font-bold">{room.room_number}</td>
                                          <td className="px-4 py-2">
                                            <Badge variant="outline" className="text-xs">
                                              {Array.isArray(room.room_types)
                                                ? room.room_types[0]?.name ?? '—'
                                                : room.room_types?.name ?? '—'}
                                            </Badge>
                                          </td>
                                          {areas.map((area) => {
                                            const sc = room.special_cleaning.find((s) => s.area_id === area.id);
                                            const isDone = sc?.status === 'done';
                                            const isIssue = sc?.status === 'issue';
                                            const isUpdating = updating === `${room.id}|${area.id}`;
                                            return (
                                              <td key={area.id} className="px-3 py-2 text-center">
                                                <button
                                                  disabled={!canToggle || isUpdating}
                                                  onClick={() => canToggle && toggleArea(room, area)}
                                                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50 ${
                                                    isDone
                                                      ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                                                      : isIssue
                                                      ? 'border-red-500 bg-red-500 text-white'
                                                      : 'border-muted-foreground/30 bg-background hover:border-emerald-400'
                                                  }`}
                                                  title={`${area.name} — ${isDone ? 'Done' : isIssue ? 'Issue' : 'Pending'}`}
                                                >
                                                  {isDone ? (
                                                    <CheckCircle2 className="h-4 w-4" />
                                                  ) : isIssue ? (
                                                    <AlertTriangle className="h-4 w-4" />
                                                  ) : (
                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                  )}
                                                </button>
                                              </td>
                                            );
                                          })}
                                          <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                              <Progress value={roomProgress} className="h-2 flex-1 [&>div]:gold-gradient" />
                                              <span className="w-8 text-xs text-muted-foreground">{roomProgress}%</span>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
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
        </>
      )}

      {!canToggle && selectedProject && (
        <p className="text-center text-sm text-muted-foreground">
          You have view-only access. Switch to a supervisor, manager, or admin account to update inspection status.
        </p>
      )}

      {/* Project dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              A new monthly project will auto-generate inspection rows for all rooms × 4 areas (Toilet Bowl, Shower Glass, Kettle Jug, Scrubing Floor).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Deep Cleaning October 2026"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="project-month">Month</Label>
                <Select value={newProjectMonth} onValueChange={setNewProjectMonth}>
                  <SelectTrigger id="project-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={m} value={(i + 1).toString()}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-year">Year</Label>
                <Input
                  id="project-year"
                  type="number"
                  value={newProjectYear}
                  onChange={(e) => setNewProjectYear(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="gold-gradient text-navy hover:opacity-90">
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete project dialog */}
      <Dialog open={!!deleteProject} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteProject?.project_name}</strong>?
              All inspection records for this project will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProject(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
