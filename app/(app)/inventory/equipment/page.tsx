'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Wrench,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  X,
  Edit3,
  Sheet,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import type { InventoryEquipment } from '@/lib/types';

interface SyncResult {
  success: boolean;
  spreadsheetUrl?: string;
  sheetName?: string;
  itemsWritten?: number;
  error?: string;
}

export default function InventoryEquipmentPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryEquipment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<InventoryEquipment>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ no: 0, item_name: '' });
  const [deleteTarget, setDeleteTarget] = useState<InventoryEquipment | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canEdit = isAdmin || isSupervisor;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_equipment')
      .select('id, no, item_name, previous_balance, new_purchase, condition_good, condition_broken, closing_inventory, need_to_purchase, price_per_unit, total_price, created_at, updated_at, profiles(name)')
      .order('no', { ascending: true });
    if (error) {
      console.error('Fetch equipment error:', error);
      toast({ title: 'Gagal memuat data', description: error.message, variant: 'destructive' });
    } else {
      setItems((data ?? []) as unknown as InventoryEquipment[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function startEdit(item: InventoryEquipment) {
    setEditingId(item.id);
    setEditingValues({
      no: item.no,
      item_name: item.item_name,
      previous_balance: item.previous_balance,
      new_purchase: item.new_purchase,
      condition_good: item.condition_good,
      condition_broken: item.condition_broken,
      closing_inventory: item.closing_inventory,
      need_to_purchase: item.need_to_purchase,
      price_per_unit: item.price_per_unit,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValues({});
  }

  async function saveEdit(id: string) {
    if (!user) return;
    const { error } = await supabase
      .from('inventory_equipment')
      .update({
        no: editingValues.no,
        item_name: editingValues.item_name,
        previous_balance: editingValues.previous_balance ?? 0,
        new_purchase: editingValues.new_purchase ?? 0,
        condition_good: editingValues.condition_good ?? 0,
        condition_broken: editingValues.condition_broken ?? 0,
        closing_inventory: editingValues.closing_inventory ?? 0,
        need_to_purchase: editingValues.need_to_purchase ?? 0,
        price_per_unit: editingValues.price_per_unit ?? 0,
      })
      .eq('id', id);
    if (error) {
      toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tersimpan', description: `${editingValues.item_name} updated.` });
      setEditingId(null);
      setEditingValues({});
      fetchItems();
    }
  }

  async function handleAdd() {
    if (!newItem.item_name.trim()) return;
    const nextNo = items.length > 0 ? Math.max(...items.map((i) => i.no)) + 1 : 1;
    const { error } = await supabase.from('inventory_equipment').insert({
      no: newItem.no || nextNo,
      item_name: newItem.item_name.trim(),
    });
    if (error) {
      toast({ title: 'Gagal tambah', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item ditambah', description: newItem.item_name });
      setNewItem({ no: 0, item_name: '' });
      setAddDialogOpen(false);
      fetchItems();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('inventory_equipment')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Gagal hapus', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Dihapus', description: `${deleteTarget.item_name} dihapus.` });
      setDeleteTarget(null);
      fetchItems();
    }
  }

  async function handleSyncToSheet() {
    setSyncing(true);
    setLastSync(null);
    try {
      // Find first special_projects row (just need a projectId for the API)
      const { data: projectData } = await supabase
        .from('special_projects')
        .select('id, project_name, month, year')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!projectData) {
        toast({
          title: 'Tidak ada project',
          description: 'Buat minimal 1 project di Special Cleaning dulu (dipakai sebagai anchor untuk sync).',
          variant: 'destructive',
        });
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
          type: 'equipment',
        }),
      });
      const data: SyncResult = await res.json();
      setLastSync(data);
      if (data.success) {
        toast({
          title: 'Synced to Sheet',
          description: `${data.itemsWritten} items → "${data.sheetName}"`,
        });
      } else {
        toast({
          title: 'Sync gagal',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      const result: SyncResult = { success: false, error: e.message };
      setLastSync(result);
      toast({ title: 'Sync gagal', description: e.message, variant: 'destructive' });
    }
    setSyncing(false);
  }

  // Summary stats
  const totalItems = items.length;
  const totalClosing = items.reduce((sum, i) => sum + (i.closing_inventory || 0), 0);
  const totalNeedPurchase = items.reduce((sum, i) => sum + (i.need_to_purchase || 0), 0);
  const totalValue = items.reduce((sum, i) => sum + (i.total_price || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Equipment"
        description="Monthly inventory untuk equipment cleaning: vacuum, blower, polisher, trolley, dll."
        action={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncToSheet}
                disabled={syncing}
              >
                <Sheet className={`mr-2 h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Sheet'}
              </Button>
              <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gold-gradient text-navy hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Items', value: totalItems, color: 'text-navy', bg: 'bg-muted' },
          { label: 'Total Closing Stock', value: totalClosing, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Need to Purchase', value: totalNeedPurchase, color: 'text-amber-600', bg: 'bg-amber-50' },
          {
            label: 'Total Value',
            value: `Rp ${totalValue.toLocaleString('id-ID')}`,
            color: 'text-gold-foreground',
            bg: 'bg-gold/10',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Card className="card-shadow-lg">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                  <Wrench className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="font-display text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Sync result banner */}
      {lastSync && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
            lastSync.success
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <Sheet className={`h-5 w-5 flex-shrink-0 mt-0.5 ${lastSync.success ? 'text-emerald-600' : 'text-red-600'}`} />
          <div className="flex-1">
            {lastSync.success ? (
              <>
                <p className="font-medium text-emerald-900">
                  Synced! {lastSync.itemsWritten} items written to sheet &quot;{lastSync.sheetName}&quot;
                </p>
                {lastSync.spreadsheetUrl && (
                  <a
                    href={lastSync.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline"
                  >
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

      {/* Equipment table */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Prev. Balance</TableHead>
                  <TableHead className="text-right">New Purchase</TableHead>
                  <TableHead className="text-right">Good</TableHead>
                  <TableHead className="text-right">Broken</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead className="text-right">Need Purchase</TableHead>
                  <TableHead className="text-right">Price/Unit</TableHead>
                  <TableHead className="text-right">Total Price</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canEdit ? 11 : 10 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 11 : 10} className="text-center text-muted-foreground py-8">
                      No items yet. {canEdit && 'Click "Add Item" to create the first one.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const isEditing = editingId === item.id;
                    if (isEditing) {
                      return (
                        <TableRow key={item.id} className="bg-muted/30">
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.no ?? ''}
                              onChange={(e) => setEditingValues({ ...editingValues, no: parseInt(e.target.value) || 0 })}
                              className="h-8 w-12"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editingValues.item_name ?? ''}
                              onChange={(e) => setEditingValues({ ...editingValues, item_name: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.previous_balance ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, previous_balance: parseInt(e.target.value) || 0 })}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.new_purchase ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, new_purchase: parseInt(e.target.value) || 0 })}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.condition_good ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, condition_good: parseInt(e.target.value) || 0 })}
                              className="h-8 w-12 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.condition_broken ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, condition_broken: parseInt(e.target.value) || 0 })}
                              className="h-8 w-12 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.closing_inventory ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, closing_inventory: parseInt(e.target.value) || 0 })}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.need_to_purchase ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, need_to_purchase: parseInt(e.target.value) || 0 })}
                              className="h-8 w-16 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editingValues.price_per_unit ?? 0}
                              onChange={(e) => setEditingValues({ ...editingValues, price_per_unit: parseFloat(e.target.value) || 0 })}
                              className="h-8 w-20 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            Rp {((editingValues.need_to_purchase ?? 0) * (editingValues.price_per_unit ?? 0)).toLocaleString('id-ID')}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => saveEdit(item.id)} className="h-7 px-2">
                                <Save className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={item.id} className="group">
                        <TableCell className="text-sm text-muted-foreground">{item.no}</TableCell>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell className="text-right text-sm">{item.previous_balance}</TableCell>
                        <TableCell className="text-right text-sm">{item.new_purchase}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{item.condition_good}</TableCell>
                        <TableCell className="text-right text-sm text-red-600">{item.condition_broken}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{item.closing_inventory}</TableCell>
                        <TableCell className="text-right text-sm text-amber-600">{item.need_to_purchase}</TableCell>
                        <TableCell className="text-right text-sm">Rp {item.price_per_unit.toLocaleString('id-ID')}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          Rp {item.total_price.toLocaleString('id-ID')}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button size="sm" variant="ghost" onClick={() => startEdit(item)} className="h-7 px-2">
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(item)}
                                className="h-7 px-2"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!canEdit && (
        <p className="text-center text-sm text-muted-foreground">
          View-only access. Switch to admin or supervisor to edit inventory.
        </p>
      )}

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Equipment Item</DialogTitle>
            <DialogDescription>
              Tambah item equipment baru. Field numerik bisa diisi nanti saat edit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">No (urutan)</label>
              <Input
                type="number"
                placeholder="Otomatis (kosongkan)"
                value={newItem.no || ''}
                onChange={(e) => setNewItem({ ...newItem, no: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Item Name</label>
              <Input
                placeholder="e.g. Vacuum Cleaner, Polisher Machine, Trolley..."
                value={newItem.item_name}
                onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newItem.item_name.trim()} className="gold-gradient text-navy hover:opacity-90">
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Hapus <strong>{deleteTarget?.item_name}</strong>? Tidak bisa di-undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
