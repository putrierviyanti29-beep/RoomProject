'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BedDouble,
  RefreshCw,
  Plus,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_LINEN_ITEMS,
  DEFAULT_LINEN_STORAGES,
  LINEN_ROOM_GROUPS,
} from '@/lib/types';
import type { InventoryLinen } from '@/lib/types';

interface SyncResult {
  success: boolean;
  spreadsheetUrl?: string;
  sheetName?: string;
  cellsWritten?: number;
  error?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function InventoryLinenPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InventoryLinen[]>([]);
  const [items, setItems] = useState<string[]>([...DEFAULT_LINEN_ITEMS]);
  const [storages, setStorages] = useState<string[]>([...DEFAULT_LINEN_STORAGES]);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [activeGroup, setActiveGroup] = useState<string>('storages');
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addStorageOpen, setAddStorageOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newStorageName, setNewStorageName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canEdit = isAdmin || isSupervisor;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_linen')
      .select('id, item_name, location, count, period_month, period_year, remarks, created_at, updated_at, created_by, profiles(name)')
      .eq('period_month', periodMonth)
      .eq('period_year', periodYear);
    if (error) {
      console.error('Fetch linen error:', error);
      toast({ title: 'Gagal memuat data', description: error.message, variant: 'destructive' });
    } else {
      setRecords((data ?? []) as unknown as InventoryLinen[]);
      const itemSet = new Set<string>(DEFAULT_LINEN_ITEMS);
      const storageSet = new Set<string>(DEFAULT_LINEN_STORAGES);
      (data ?? []).forEach((r: any) => {
        if (r.item_name) itemSet.add(r.item_name);
        if (r.location && !/^\d+$/.test(r.location)) storageSet.add(r.location);
      });
      setItems(Array.from(itemSet));
      setStorages(Array.from(storageSet));
    }
    setLoading(false);
  }, [periodMonth, periodYear, toast]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      map.set(`${r.item_name}|${r.location}`, r.count || 0);
    });
    return map;
  }, [records]);

  function getCount(item: string, location: string): number {
    return countMap.get(`${item}|${location}`) ?? 0;
  }

  function startEditCell(item: string, location: string) {
    setEditingCell(`${item}|${location}`);
    setEditValue(String(getCount(item, location)));
  }

  async function saveCell(item: string, location: string) {
    if (!user) return;
    const newCount = parseInt(editValue) || 0;
    const existing = records.find((r) => r.item_name === item && r.location === location);
    if (existing) {
      const { error } = await supabase
        .from('inventory_linen')
        .update({ count: newCount })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const { error } = await supabase.from('inventory_linen').insert({
        item_name: item,
        location,
        count: newCount,
        period_month: periodMonth,
        period_year: periodYear,
        created_by: user.id,
      });
      if (error) {
        toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
        return;
      }
    }
    toast({ title: 'Tersimpan', description: `${item} @ ${location}: ${newCount}` });
    setEditingCell(null);
    setEditValue('');
    fetchRecords();
  }

  function handleAddItem() {
    if (!newItemName.trim()) return;
    if (items.includes(newItemName.trim())) {
      toast({ title: 'Sudah ada', description: 'Item sudah ada di list.', variant: 'destructive' });
      return;
    }
    setItems([...items, newItemName.trim()]);
    toast({ title: 'Item ditambah', description: newItemName });
    setNewItemName('');
    setAddItemOpen(false);
  }

  function handleAddStorage() {
    if (!newStorageName.trim()) return;
    if (storages.includes(newStorageName.trim())) {
      toast({ title: 'Sudah ada', description: 'Storage sudah ada di list.', variant: 'destructive' });
      return;
    }
    setStorages([...storages, newStorageName.trim()]);
    toast({ title: 'Storage ditambah', description: newStorageName });
    setNewStorageName('');
    setAddStorageOpen(false);
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
          type: 'linen',
        }),
      });
      const data: SyncResult = await res.json();
      setLastSync(data);
      if (data.success) {
        toast({
          title: 'Synced to Sheet',
          description: `${data.cellsWritten} cells → "${data.sheetName}"`,
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

  const activeLocations: string[] =
    activeGroup === 'storages'
      ? storages
      : LINEN_ROOM_GROUPS.find((g) => g.label === activeGroup)?.rooms ?? [];

  const totalRecords = records.length;
  const totalItems = items.length;
  const totalLocations = storages.length + LINEN_ROOM_GROUPS.reduce((sum, g) => sum + g.rooms.length, 0);
  const totalStock = records.reduce((sum, r) => sum + (r.count || 0), 0);

  const groupTabs = [
    { key: 'storages', label: `Storages (${storages.length})` },
    ...LINEN_ROOM_GROUPS.map((g) => ({ key: g.label, label: `${g.label} (${g.rooms.length})` })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Linen"
        description="Track linen items per room & storage location. Matrix grid dengan inline edit."
        action={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncToSheet} disabled={syncing}>
                <Sheet className={`mr-2 h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Sheet'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddStorageOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Storage
              </Button>
              <Button size="sm" onClick={() => setAddItemOpen(true)} className="gold-gradient text-navy hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                Item
              </Button>
            </div>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Items', value: totalItems, color: 'text-navy', bg: 'bg-muted' },
          { label: 'Total Locations', value: totalLocations, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Records Saved', value: totalRecords, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Stock Count', value: totalStock, color: 'text-amber-600', bg: 'bg-amber-50' },
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
                  <BedDouble className={`h-5 w-5 ${stat.color}`} />
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
                  Synced! {lastSync.cellsWritten} cells written to sheet &quot;{lastSync.sheetName}&quot;
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

      {/* Period selector */}
      <Card className="card-shadow-lg">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium">Periode:</span>
          <select
            value={periodMonth}
            onChange={(e) => setPeriodMonth(parseInt(e.target.value))}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <Input
            type="number"
            value={periodYear}
            onChange={(e) => setPeriodYear(parseInt(e.target.value) || new Date().getFullYear())}
            className="h-8 w-24"
          />
          <span className="ml-auto text-xs text-muted-foreground">
            {records.length} records for this period
          </span>
        </CardContent>
      </Card>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        {groupTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveGroup(tab.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              activeGroup === tab.key
                ? 'gold-gradient text-navy'
                : 'border border-border bg-card text-muted-foreground hover:border-gold/50 hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matrix table */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr>
                  <th className="min-w-[40px] border-r px-3 py-2 text-left font-medium">No</th>
                  <th className="min-w-[180px] border-r px-3 py-2 text-left font-medium">Item</th>
                  {activeLocations.map((loc) => (
                    <th
                      key={loc}
                      className="min-w-[70px] border-r px-2 py-2 text-center font-medium"
                      title={loc}
                    >
                      {loc}
                    </th>
                  ))}
                  <th className="min-w-[70px] px-2 py-2 text-center font-medium bg-gold/10">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td colSpan={activeLocations.length + 3} className="px-3 py-2">
                        <div className="h-6 animate-pulse rounded bg-muted/50" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={activeLocations.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                      No items yet. Click &quot;Item&quot; to add linen items.
                    </td>
                  </tr>
                ) : (
                  items.map((item, itemIdx) => {
                    const rowTotal = activeLocations.reduce(
                      (sum, loc) => sum + getCount(item, loc),
                      0
                    );
                    return (
                      <tr key={item} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="border-r px-3 py-1.5 text-xs text-muted-foreground">{itemIdx + 1}</td>
                        <td className="border-r px-3 py-1.5 font-medium">{item}</td>
                        {activeLocations.map((loc) => {
                          const cellKey = `${item}|${loc}`;
                          const isEditing = editingCell === cellKey;
                          const count = getCount(item, loc);
                          return (
                            <td
                              key={loc}
                              className="border-r px-1 py-1 text-center"
                              onClick={() => canEdit && !isEditing && startEditCell(item, loc)}
                            >
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => saveCell(item, loc)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveCell(item, loc);
                                    if (e.key === 'Escape') {
                                      setEditingCell(null);
                                      setEditValue('');
                                    }
                                  }}
                                  autoFocus
                                  className="h-7 w-14 rounded border border-gold bg-background px-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                                />
                              ) : (
                                <span
                                  className={`inline-block h-7 w-14 rounded ${
                                    canEdit ? 'cursor-pointer hover:bg-gold/10' : ''
                                  } ${
                                    count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground/40'
                                  }`}
                                  title={canEdit ? 'Click to edit' : ''}
                                >
                                  {count > 0 ? count : '—'}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center font-semibold bg-gold/10">{rowTotal}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
            <li>Pilih tab <strong>Storages</strong> untuk input stock di gudang (Linen Room, Gudang 3C, dll).</li>
            <li>Pilih tab <strong>Section X Floor Y</strong> untuk input linen per kamar di floor tersebut.</li>
            <li>Klik cell untuk edit count. Tekan <strong>Enter</strong> untuk simpan, <strong>Esc</strong> untuk batal.</li>
            <li>Row &quot;Total&quot; di kanan otomatis sum semua location di row itu.</li>
            <li>Klik <strong>Sync to Sheet</strong> untuk export semua data ke Google Sheets bulan berjalan.</li>
            <li>Period selector di atas untuk lihat/edit data bulan lain.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Add Item dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Linen Item</DialogTitle>
            <DialogDescription>Tambah jenis linen baru (e.g. Hand Towel, Face Towel, Duvet Cover).</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Hand Towel"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddItem();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!newItemName.trim()} className="gold-gradient text-navy hover:opacity-90">
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Storage dialog */}
      <Dialog open={addStorageOpen} onOpenChange={setAddStorageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Storage Location</DialogTitle>
            <DialogDescription>Tambah lokasi storage baru (e.g. Gudang 6A, Laundry Room).</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Gudang 6A"
            value={newStorageName}
            onChange={(e) => setNewStorageName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddStorage();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStorageOpen(false)}>Cancel</Button>
            <Button onClick={handleAddStorage} disabled={!newStorageName.trim()} className="gold-gradient text-navy hover:opacity-90">
              Add Storage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
