'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Wrench,
  Plus,
  Trash2,
  RefreshCw,
  Sheet,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type NumericField =
  | 'previous_balance'
  | 'new_purchase'
  | 'condition_good'
  | 'condition_broken'
  | 'closing_inventory'
  | 'need_to_purchase'
  | 'price_per_unit';

const NUMERIC_FIELDS: { key: NumericField; label: string; width: string }[] = [
  { key: 'previous_balance', label: 'Prev. Balance', width: 'w-20' },
  { key: 'new_purchase', label: 'New Purchase', width: 'w-20' },
  { key: 'condition_good', label: 'Good', width: 'w-16' },
  { key: 'condition_broken', label: 'Broken', width: 'w-16' },
  { key: 'closing_inventory', label: 'Closing', width: 'w-20' },
  { key: 'need_to_purchase', label: 'Need Purchase', width: 'w-20' },
  { key: 'price_per_unit', label: 'Price/Unit', width: 'w-24' },
];

export default function InventoryEquipmentPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryEquipment[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null); // `${id}|${field}`
  const [editValue, setEditValue] = useState<string>('');
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

  function startEditCell(id: string, field: NumericField, currentValue: number | null) {
    setEditingCell(`${id}|${field}`);
    setEditValue(currentValue === null ? '' : String(currentValue));
  }

  async function saveCell(id: string, field: NumericField) {
    if (!user) return;
    // Empty string → null (so cell becomes empty, not 0)
    // Otherwise parse as number
    const newValue: number | null = editValue.trim() === '' ? null : parseFloat(editValue);
    if (newValue !== null && isNaN(newValue)) {
      toast({ title: 'Invalid', description: 'Masukkan angka yang valid.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('inventory_equipment')
      .update({ [field]: newValue })
      .eq('id', id);
    if (error) {
      toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingCell(null);
    setEditValue('');
    fetchItems();
  }

  async function handleAdd() {
    if (!newItem.item_name.trim()) return;
    const nextNo = newItem.no || (items.length > 0 ? Math.max(...items.map((i) => i.no)) + 1 : 1);
    const { error } = await supabase.from('inventory_equipment').insert({
      no: nextNo,
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
      const { data: projectData } = await supabase
        .from('special_projects')
        .select('id, project_name, month, year')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!projectData) {
        toast({
          title: 'Tidak ada project',
          description: 'Buat minimal 1 project di Special Cleaning dulu.',
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
        toast({ title: 'Sync gagal', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      setLastSync({ success: false, error: e.message });
      toast({ title: 'Sync gagal', description: e.message, variant: 'destructive' });
    }
    setSyncing(false);
  }

  // Helper: format display value (null → '—', number → string)
  function fmt(val: number | null | undefined): string {
    if (val === null || val === undefined) return '—';
    return String(val);
  }

  function fmtPrice(val: number | null | undefined): string {
    if (val === null || val === undefined) return '—';
    return `Rp ${val.toLocaleString('id-ID')}`;
  }

  // Summary stats (count non-null only)
  const totalItems = items.length;
  const totalClosing = items.reduce((sum, i) => sum + (i.closing_inventory ?? 0), 0);
  const totalNeedPurchase = items.reduce((sum, i) => sum + (i.need_to_purchase ?? 0), 0);
  const totalValue = items.reduce((sum, i) => sum + (i.total_price ?? 0), 0);

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
              <Button variant="outline" size="sm" onClick={handleSyncToSheet} disabled={syncing}>
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
            lastSync.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
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

      {/* Equipment table — inline edit, no action column */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">No</TableHead>
                  <TableHead className="min-w-[180px]">Item</TableHead>
                  {NUMERIC_FIELDS.map((f) => (
                    <TableHead key={f.key} className={`text-right ${f.width}`}>{f.label}</TableHead>
                  ))}
                  <TableHead className="text-right w-32 bg-gold/10">Total Price</TableHead>
                  {canEdit && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: NUMERIC_FIELDS.length + 3 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={NUMERIC_FIELDS.length + 3} className="text-center text-muted-foreground py-8">
                      No items yet. {canEdit && 'Click "Add Item" to create the first one.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="group hover:bg-muted/20">
                      <TableCell className="text-sm text-muted-foreground">{item.no}</TableCell>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      {NUMERIC_FIELDS.map((f) => {
                        const cellKey = `${item.id}|${f.key}`;
                        const isEditing = editingCell === cellKey;
                        const value = item[f.key];
                        return (
                          <TableCell
                            key={f.key}
                            className="text-right text-sm px-1"
                            onClick={() => canEdit && !isEditing && startEditCell(item.id, f.key, value)}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveCell(item.id, f.key)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCell(item.id, f.key);
                                  if (e.key === 'Escape') {
                                    setEditingCell(null);
                                    setEditValue('');
                                  }
                                }}
                                autoFocus
                                placeholder="—"
                                className="h-7 w-full rounded border border-gold bg-background px-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                              />
                            ) : (
                              <span
                                className={`inline-block h-7 w-full rounded px-1 leading-7 ${
                                  canEdit ? 'cursor-pointer hover:bg-gold/10' : ''
                                } ${
                                  value === null || value === undefined
                                    ? 'text-muted-foreground/40'
                                    : 'font-medium text-foreground'
                                }`}
                                title={canEdit ? 'Click to edit' : ''}
                              >
                                {fmt(value)}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right text-sm font-medium bg-gold/10">
                        {fmtPrice(item.total_price)}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
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

      {/* Help card */}
      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Settings className="h-4 w-4" />
            How to use
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Klik cell mana saja untuk edit langsung. Tekan <strong>Enter</strong> untuk simpan, <strong>Esc</strong> untuk batal.</li>
            <li>Cell kosong (—) artinya belum diisi. <strong>Bukan 0</strong> — biarkan kosong kalau memang tidak ada data.</li>
            <li><strong>Total Price</strong> otomatis dihitung: Need Purchase × Price/Unit (gold column, read-only).</li>
            <li>Hover row → icon trash muncul di kanan untuk delete item.</li>
            <li>Klik <strong>Sync to Sheet</strong> untuk export semua data ke Google Sheets bulan berjalan.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Equipment Item</DialogTitle>
            <DialogDescription>
              Tambah item equipment baru. Field numerik bisa diisi nanti dengan klik cell.
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
