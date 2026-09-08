'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
    if (!user) return;
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchChecklists();
    }
    setUpdating(null);
  }

  async function deleteChecklistItem(item: SpecialChecklist) {
    const { error } = await supabase.from('special_checklists').delete().eq('id', item.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item Removed', description: `${item.item_name} has been removed.` });
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
        description="Monthly special cleaning projects with themed checklists."
        action={
          isAdmin && (
            <Button className="gold-gradient text-navy hover:opacity-90" size="sm" onClick={() => setProjectDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Project list */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:col-span-1"
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Projects</CardTitle>
                <Sparkles className="h-5 w-5 text-gold" />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/50" />
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No projects yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projects.map((project) => {
                      const active = selectedProject?.id === project.id;
                      return (
                        <div
                          key={project.id}
                          onClick={() => setSelectedProject(project)}
                          className={`group cursor-pointer rounded-lg border p-4 transition-all ${
                            active
                              ? 'border-gold bg-amber-50/50'
                              : 'border-border bg-card hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm">{project.project_name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {MONTH_NAMES[project.month - 1]} {project.year}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteProject(project);
                                  }}
                                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${active ? 'rotate-90' : ''}`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Checklist detail */}
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
                      <span>·</span>
                      <span>{totalCount} total</span>
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
                    <div className="space-y-2">
                      <AnimatePresence>
                        {checklists.map((item, i) => {
                          const isDone = item.status === 'done';
                          return (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              transition={{ duration: 0.2, delay: i * 0.03 }}
                              className={`group flex items-center gap-3 rounded-lg border p-4 transition-all ${
                                isDone ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-card'
                              }`}
                            >
                              <Checkbox
                                checked={isDone}
                                disabled={!canToggle || updating === item.id}
                                onCheckedChange={() => toggleChecklistItem(item)}
                                className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                              />
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                                  {item.item_name}
                                </p>
                                {isDone && item.profiles && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    by {item.profiles.name}
                                    {item.completed_at && ` · ${new Date(item.completed_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}`}
                                  </p>
                                )}
                              </div>
                              {isDone ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                                  Done
                                </Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => deleteChecklistItem(item)}
                                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                  {!canToggle && (
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

      {/* Create Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Special Cleaning Project</DialogTitle>
            <DialogDescription>
              Set up a new monthly special cleaning project with a themed focus.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                placeholder="e.g. Deep Cleaning Bathroom"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={newProjectMonth} onValueChange={setNewProjectMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={newProjectYear}
                  onChange={(e) => setNewProjectYear(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-navy hover:opacity-90" onClick={handleCreateProject}>
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Checklist Item Dialog */}
      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Checklist Item</DialogTitle>
            <DialogDescription>
              Add a cleaning task to {selectedProject?.project_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input
                placeholder="e.g. Scrub bathroom tiles"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChecklistItem();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialogOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-navy hover:opacity-90" onClick={handleAddChecklistItem}>
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation */}
      <Dialog open={!!deleteProject} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{deleteProject?.project_name}" and all its checklist items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProject(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
