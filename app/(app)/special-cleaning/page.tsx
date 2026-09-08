'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Calendar,
  RefreshCw,
  Award,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brush,
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
import { Textarea } from '@/components/ui/textarea';
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
import type { SpecialProject, InspectionArea, SpecialCleaning, DoneType } from '@/lib/types';
import { MONTH_NAMES } from '@/lib/types';

interface RoomLite {
  id: string;
  room_number: string;
  room_type_id: string | null;
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
  const [issueDialog, setIssueDialog] = useState<{
    roomId: string;
    areaId: string;
    roomNumber: string;
    areaName: string;
  } | null>(null);
  const [issueNotes, setIssueNotes] = useState('');

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectMonth, setNewProjectMonth] = useState((new Date().getMonth() + 1).toString());
  const [newProjectYear, setNewProjectYear] = useState(new Date().getFullYear().toString());
  const [deleteProject, setDeleteProject] = useState<SpecialProject | null>(null);

  // ---- Fetch projects ----
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

  // ---- Fetch inspection areas (active only) ----
  const fetchAreas = useCallback(async () => {
    const { data } = await supabase
      .from('inspection_areas')
      .select('id, name, display_order, is_active, created_at')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    setAreas(data ?? []);
  }, []);

  // ---- Fetch rooms + special_cleaning records for selected project ----
  const fetchRoomsAndSC = useCallback(async () => {
    if (!selectedProject) {
      setRooms([]);
      return;
    }
    setScLoading(true);
    const [roomsRes, scRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, room_number, room_type_id, section, floor, room_types(id, name)')
        .order('room_number', { ascending: true }),
      supabase
        .from('special_cleaning')
        .select('id, project_id, room_id, area_id, status, done_type, completed_by, completed_at, notes, date, profiles(name, email), inspection_areas(id, name)')
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

  // Group rooms by section → floor
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

  // ---- Project CRUD ----
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
      toast({ title: 'Project Created', description: `${newProjectName} has been created.` });
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
      if (selectedProject?.id === deleteProject.id) {
        setSelectedProject(null);
      }
      setDeleteProject(null);
      fetchProjects();
    }
  }

  // ---- Area toggle (per room per area) ----
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
          completed_by: newStatus === 'done' ? user.id : null,
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
        toast({
          title: 'Marked as done',
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchRoomsAndSC();
      }
    }
    setUpdating(null);
  }

  async function setAreaDoneType(room: RoomWithSC, area: InspectionArea, doneType: DoneType) {
    if (!user || !canToggle) return;
    const existing = room.special_cleaning.find((s) => s.area_id === area.id);
    setUpdating(`${room.id}|${area.id}`);
    if (existing) {
      const { error } = await supabase
        .from('special_cleaning')
        .update({
          status: 'done',
          done_type: doneType,
          completed_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: `Done by ${doneType === 'housekeeping' ? 'Housekeeping' : 'Engineering'}`,
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchRoomsAndSC();
      }
    } else {
      const { error } = await supabase.from('special_cleaning').insert({
        project_id: selectedProject!.id,
        room_id: room.id,
        area_id: area.id,
        status: 'done',
        done_type: doneType,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
      });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: `Done by ${doneType === 'housekeeping' ? 'Housekeeping' : 'Engineering'}`,
          description: `Room ${room.room_number} — ${area.name}`,
        });
        fetchRoomsAndSC();
      }
    }
    setUpdating(null);
  }

  async function saveIssue() {
    if (!issueDialog || !user) return;
    const { roomId, areaId } = issueDialog;
    const room = rooms.find((r) => r.id === roomId);
    const existing = room?.special_cleaning.find((s) => s.area_id === areaId);
    setUpdating(`${roomId}|${areaId}`);
    if (existing) {
      const { error } = await supabase
        .from('special_cleaning')
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
        fetchRoomsAndSC();
      }
    } else {
      const { error } = await supabase.from('special_cleaning').insert({
        project_id: selectedProject!.id,
        room_id: roomId,
        area_id: areaId,
        status: 'issue',
        notes: issueNotes.trim() || null,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
      });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Issue logged', description: `Room ${room?.room_number} — notes saved.`, variant: 'destructive' });
        fetchRoomsAndSC();
      }
    }
    setUpdating(null);
    setIssueDialog(null);
    setIssueNotes('');
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  // Stats for selected project
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
        description="Monthly special cleaning projects. Each project has 4 inspection areas per room (Toilet Bowl, Shower Glass, Kettle Jug, Scrubing Floor)."
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
            <p className="text-sm text-muted-foreground">No project selected. Create one to get started.</p>
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

          {/* Search */}
          <div className="relative">
            <Input
              placeholder="Search room number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Areas legend */}
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
                              <CardContent className="p-0">
                                <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-2 xl:grid-cols-3">
                                  {floorGroup.rooms.map((room) => (
                                    <RoomInspectionCard
                                      key={room.id}
                                      room={room}
                                      areas={areas}
                                      canToggle={canToggle}
                                      updating={updating}
                                      onToggle={(area) => toggleArea(room, area)}
                                      onSetDoneType={(area, dt) => setAreaDoneType(room, area, dt)}
                                      onIssue={(area) => {
                                        setIssueDialog({
                                          roomId: room.id,
                                          areaId: area.id,
                                          roomNumber: room.room_number,
                                          areaName: area.name,
                                        });
                                        const existing = room.special_cleaning.find((s) => s.area_id === area.id);
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
              Create a new monthly special cleaning project. Each project generates a fresh checklist for all rooms.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Deep Cleaning Q3 2026"
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
              This will permanently remove all inspection records for this project.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProject(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            placeholder="e.g. Shower glass has cracks, needs replacement..."
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
// RoomInspectionCard — one room with all inspection areas (4 checkboxes)
// ============================================================================
interface RoomInspectionCardProps {
  room: RoomWithSC;
  areas: InspectionArea[];
  canToggle: boolean;
  updating: string | null;
  onToggle: (area: InspectionArea) => void;
  onSetDoneType: (area: InspectionArea, doneType: DoneType) => void;
  onIssue: (area: InspectionArea) => void;
}

function RoomInspectionCard({
  room,
  areas,
  canToggle,
  updating,
  onToggle,
  onSetDoneType,
  onIssue,
}: RoomInspectionCardProps) {
  const doneCount = areas.filter((a) =>
    room.special_cleaning.find((s) => s.area_id === a.id && s.status === 'done')
  ).length;
  const issueCount = areas.filter((a) =>
    room.special_cleaning.find((s) => s.area_id === a.id && s.status === 'issue')
  ).length;
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
          <p className="font-medium">{doneCount}/{areas.length} done</p>
          {issueCount > 0 && <p className="text-red-600">{issueCount} issue{issueCount > 1 ? 's' : ''}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        {areas.map((area) => {
          const sc = room.special_cleaning.find((s) => s.area_id === area.id);
          const status = sc?.status;
          const doneType = sc?.done_type;
          const isUpdating = updating === `${room.id}|${area.id}`;
          return (
            <div
              key={area.id}
              className={`flex items-center gap-2 rounded-md border p-2 text-sm transition-all ${
                status === 'done'
                  ? doneType === 'engineering'
                    ? 'border-blue-200 bg-blue-50/50'
                    : 'border-emerald-200 bg-emerald-50/50'
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
                    ? doneType === 'engineering'
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-muted-foreground/30 bg-background'
                }`}
              >
                {status === 'done' && <CheckCircle2 className="h-3 w-3" />}
              </button>
              <span className="flex-1 truncate">{area.name}</span>

              {status === 'done' && (
                <>
                  <span
                    className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-xs ${
                      doneType === 'engineering' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {doneType === 'engineering' ? (
                      <Wrench className="h-3 w-3" />
                    ) : (
                      <Brush className="h-3 w-3" />
                    )}
                    {doneType === 'engineering' ? 'Eng' : 'HK'}
                  </span>
                  <button
                    disabled={!canToggle || isUpdating}
                    onClick={() => onSetDoneType(area, doneType === 'engineering' ? 'housekeeping' : 'engineering')}
                    className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Switch done type"
                  >
                    ⇄
                  </button>
                  {sc?.completed_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(sc.completed_at).toLocaleString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </>
              )}

              {status === 'issue' && (
                <button
                  disabled={!canToggle || isUpdating}
                  onClick={() => canToggle && onIssue(area)}
                  className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-200"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Issue
                </button>
              )}

              {canToggle && status !== 'done' && status !== 'issue' && (
                <button
                  disabled={isUpdating}
                  onClick={() => onIssue(area)}
                  className="rounded p-1 text-muted-foreground opacity-50 transition-opacity hover:text-red-600"
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
      {room.special_cleaning.some((s) => s.notes) && (
        <div className="mt-2 space-y-1">
          {room.special_cleaning
            .filter((s) => s.notes)
            .map((s) => (
              <p key={s.id} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                <strong>{s.inspection_areas?.name ?? 'Area'}:</strong> {s.notes}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
