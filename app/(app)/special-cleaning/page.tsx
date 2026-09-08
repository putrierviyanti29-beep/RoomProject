'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Award,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { SpecialProject, SpecialChecklist } from '@/lib/types';
import { MONTH_NAMES } from '@/lib/types';

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
  const [checklists, setChecklists] = useState<SpecialChecklist[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);

  // Dialog states
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectMonth, setNewProjectMonth] = useState((new Date().getMonth() + 1).toString());
  const [newProjectYear, setNewProjectYear] = useState(new Date().getFullYear().toString());
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [deleteProject, setDeleteProject] = useState<SpecialProject | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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

  const fetchChecklists = useCallback(async () => {
    if (!selectedProject) return;
    setChecklistLoading(true);
    const { data } = await supabase
      .from('special_checklists')
      .select('id, project_id, item_name, status, completed_by, completed_at, created_at, profiles(name, email)')
      .eq('project_id', selectedProject.id)
      .order('created_at', { ascending: true });
    setChecklists((data ?? []) as unknown as SpecialChecklist[]);
    setChecklistLoading(false);
  }, [selectedProject]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

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

  async function handleAddChecklistItem() {
    if (!selectedProject || !newChecklistItem.trim()) return;
    const { error } = await supabase.from('special_checklists').insert({
      project_id: selectedProject.id,
      item_name: newChecklistItem.trim(),
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item Added', description: `${newChecklistItem} has been added to the checklist.` });
      setNewChecklistItem('');
      setChecklistDialogOpen(false);
      fetchChecklists();
    }
  }

  async function toggleChecklistItem(item: SpecialChecklist) {
    if (!user || !canToggle) return;
    setUpdating(item.id);
    const newStatus = item.status === 'done' ? 'pending' : 'done';
    const { error } = await supabase
      .from('special_checklists')
      .update({
        status: newStatus,
        completed_by: newStatus === 'done' ? user.id : null,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      })
      .eq('id', item.id);

    if (error) {
      console.error('Toggle checklist error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: newStatus === 'done' ? 'Marked as done' : 'Marked as pending',
        description: item.item_name,
      });
      fetchChecklists();
    }
    setUpdating(null);
  }

  async function deleteChecklistItem(item: SpecialChecklist) {
    const { error } = await supabase.from('special_checklists').delete().eq('id', item.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item Deleted', description: `${item.item_name} has been removed.` });
      fetchChecklists();
    }
  }

  const doneCount = checklists.filter((c) => c.status === 'done').length;
  const totalCount = checklists.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Special Cleaning"
        description="Monthly special cleaning projects with themed checklists. Each project can have its own list of items."
        action={
          isAdmin && (
            <Button size="sm" onClick={() => setProjectDialogOpen(true)} className="gold-gradient text-navy hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project list (left) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:col-span-1"
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <CardTitle className="text-lg">Projects</CardTitle>
              <p className="text-sm text-muted-foreground">{projects.length} project(s)</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                  <Sparkles className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No projects yet</p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setProjectDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create first project
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-2">
                  <div className="space-y-2">
                    {projects.map((project, i) => {
                      const isActive = selectedProject?.id === project.id;
                      return (
                        <motion.button
                          key={project.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.05 }}
                          onClick={() => setSelectedProject(project)}
                          className={`w-full rounded-lg border p-4 text-left transition-all ${
                            isActive
                              ? 'border-gold bg-gold/5 shadow-sm'
                              : 'border-border hover:border-gold/50 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-tight">{project.project_name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {MONTH_NAMES[project.month - 1]} {project.year}
                              </p>
                            </div>
                            {isActive && (
                              <Badge className="bg-gold/20 text-gold-foreground hover:bg-gold/20">
                                <CheckCircle2 className="h-3 w-3" />
                              </Badge>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteProject(project);
                              }}
                              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Checklist detail (right) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="card-shadow-lg h-full">
            {selectedProject ? (
              <>
                <CardHeader>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedProject.project_name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {MONTH_NAMES[selectedProject.month - 1]} {selectedProject.year}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={() => setChecklistDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Item
                      </Button>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-3 [&>div]:gold-gradient" />
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <span>{doneCount} completed</span>
                      <span>·</span>
                      <span>{totalCount - doneCount} pending</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {checklistLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                      ))}
                    </div>
                  ) : checklists.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-3">
                      <Award className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No checklist items yet</p>
                      {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setChecklistDialogOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add first item
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-12">Done</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Done By</TableHead>
                            <TableHead>Completed At</TableHead>
                            {isAdmin && <TableHead className="w-12"></TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence>
                            {checklists.map((item, i) => {
                              const isDone = item.status === 'done';
                              return (
                                <motion.tr
                                  key={item.id}
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, x: -10 }}
                                  transition={{ duration: 0.2, delay: i * 0.02 }}
                                  className={`group cursor-pointer transition-colors ${
                                    isDone ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-muted/30'
                                  } ${!canToggle ? 'cursor-default' : ''}`}
                                  onClick={() => canToggle && toggleChecklistItem(item)}
                                >
                                  <TableCell>
                                    <Checkbox
                                      checked={isDone}
                                      disabled={!canToggle || updating === item.id}
                                      onCheckedChange={() => canToggle && toggleChecklistItem(item)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                                    />
                                  </TableCell>
                                  <TableCell className={`font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                                    {item.item_name}
                                  </TableCell>
                                  <TableCell>
                                    {isDone ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Done</Badge>
                                    ) : (
                                      <Badge variant="outline">Pending</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.profiles?.name ?? '—'}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.completed_at
                                      ? new Date(item.completed_at).toLocaleString('en-US', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          month: 'short',
                                          day: 'numeric',
                                        })
                                      : '—'}
                                  </TableCell>
                                  {isAdmin && (
                                    <TableCell>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteChecklistItem(item);
                                        }}
                                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </TableCell>
                                  )}
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {!canToggle && checklists.length > 0 && (
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      View-only access. Supervisors, managers, and admins can update checklist status.
                    </p>
                  )}
                </CardContent>
              </>
            ) : (
              <CardContent className="flex h-[500px] flex-col items-center justify-center gap-3">
                <Sparkles className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Select a project to view its checklist</p>
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Project dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new monthly special cleaning project. Each project gets its own checklist of items.
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

      {/* Add checklist item dialog */}
      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Checklist Item</DialogTitle>
            <DialogDescription>
              Add a new item to <strong>{selectedProject?.project_name}</strong>. This item will appear in the table above.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="checklist-item">Item Name</Label>
            <Input
              id="checklist-item"
              placeholder="e.g. Clean AC filters, Polish door handles, Deep clean carpets..."
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChecklistItem();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddChecklistItem} disabled={!newChecklistItem.trim()} className="gold-gradient text-navy hover:opacity-90">
              Add Item
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
              All checklist items in this project will be permanently removed.
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
