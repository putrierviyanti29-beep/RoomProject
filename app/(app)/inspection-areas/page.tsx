'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, GripVertical, RefreshCw, Edit3, Check, X, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { InspectionArea } from '@/lib/types';

export default function InspectionAreasPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<InspectionArea[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Role guard: admin only
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  const fetchAreas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('inspection_areas')
      .select('id, name, display_order, is_active, created_at')
      .order('display_order', { ascending: true });
    setAreas(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') fetchAreas();
  }, [profile, fetchAreas]);

  if (authLoading || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    const nextOrder = areas.length > 0 ? Math.max(...areas.map((a) => a.display_order)) + 1 : 1;
    const { error } = await supabase.from('inspection_areas').insert({
      name: newName.trim(),
      display_order: nextOrder,
      is_active: true,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Inspection area added', description: `${newName} has been added.` });
      setNewName('');
      setDialogOpen(false);
      fetchAreas();
    }
  }

  async function handleUpdate(id: string) {
    if (!editingName.trim()) return;
    const { error } = await supabase
      .from('inspection_areas')
      .update({ name: editingName.trim() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: 'Inspection area renamed.' });
      setEditingId(null);
      setEditingName('');
      fetchAreas();
    }
  }

  async function handleDelete(area: InspectionArea) {
    const { error } = await supabase.from('inspection_areas').delete().eq('id', area.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: `${area.name} has been removed.` });
      fetchAreas();
    }
  }

  async function toggleActive(area: InspectionArea) {
    const { error } = await supabase
      .from('inspection_areas')
      .update({ is_active: !area.is_active })
      .eq('id', area.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchAreas();
    }
  }

  async function moveOrder(area: InspectionArea, delta: number) {
    const sorted = [...areas].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((a) => a.id === area.id);
    const swapIdx = idx + delta;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swap = sorted[swapIdx];
    await Promise.all([
      supabase.from('inspection_areas').update({ display_order: swap.display_order }).eq('id', area.id),
      supabase.from('inspection_areas').update({ display_order: area.display_order }).eq('id', swap.id),
    ]);
    fetchAreas();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspection Areas"
        description="Manage the cleaning inspection checklist items that appear on the General Cleaning page."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAreas} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gold-gradient text-navy hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Add Area
            </Button>
          </div>
        }
      />

      <Card className="card-shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Inspection Checklist Items</CardTitle>
          <p className="text-sm text-muted-foreground">
            These items appear as checkboxes for each room on the General Cleaning page. Drag with the arrows to reorder.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : areas.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No inspection areas yet. Add your first one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {areas.map((area, i) => (
                <motion.div
                  key={area.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveOrder(area, -1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <GripVertical className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      onClick={() => moveOrder(area, 1)}
                      disabled={i === areas.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-medium">
                    {area.display_order}
                  </div>

                  <div className="flex-1">
                    {editingId === area.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdate(area.id);
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditingName('');
                            }
                          }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleUpdate(area.id)}>
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditingName('');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className={`font-medium ${!area.is_active ? 'text-muted-foreground line-through' : ''}`}>
                        {area.name}
                      </p>
                    )}
                  </div>

                  {editingId !== area.id && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{area.is_active ? 'Active' : 'Hidden'}</span>
                        <Switch checked={area.is_active} onCheckedChange={() => toggleActive(area)} />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(area.id);
                          setEditingName(area.name);
                        }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(area)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">Default inspection areas (from spreadsheet template):</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Toilet Bowl</li>
            <li>Shower Glass</li>
            <li>Kettle Jug</li>
            <li>Scrubing Floor</li>
          </ul>
          <p className="mt-3">
            These were seeded automatically when the migration ran. You can rename, deactivate, or add new areas as needed.
            Changes here immediately reflect on the General Cleaning page.
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Inspection Area</DialogTitle>
            <DialogDescription>
              Add a new item to the cleaning checklist. It will appear as a checkbox on every room in the General Cleaning page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="area-name">Area Name</Label>
            <Input
              id="area-name"
              placeholder="e.g. Mirror Cleaning"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName.trim()} className="gold-gradient text-navy hover:opacity-90">
              Add Area
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
