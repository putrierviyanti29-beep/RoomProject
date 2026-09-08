'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
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
  DEFAULT_ASET_AREA_ITEMS,
  DEFAULT_ASET_AREA_LOCATIONS,
} from '@/lib/types';
import type { InventoryAsetArea } from '@/lib/types';

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

export default function InventoryAsetAreaPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InventoryAsetArea[]>([]);
  const [items, setItems] = useState<string[]>([...DEFAULT_ASET_AREA_ITEMS]);
  const [locations, setLocations] = useState<string[]>([...DEFAULT_ASET_AREA_LOCATIONS]);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canEdit = isAdmin || isSupervisor;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_aset_area')
      .select('id, item_name, location, count, period_month, period_year, remarks, created_at, updated_at, created_by, profiles(name)')
      .eq('period_month', periodMonth)
      .eq('period_year', periodYear);
    if (error) {
      console.error('Fetch aset area error:', error);
      toast({ title: 'Gagal memuat data', description: error.message, variant: 'destructive' });
    } else {
      setRecords((data ?? []) as unknown as InventoryAsetArea[]);
      const itemSet = new Set<string>(DEFAULT_ASET_AREA_ITEMS);
      const locSet = new Set<string>(DEFAULT_ASET_AREA_LOCATIONS);
      (data ?? []).forEach((r: any) => {
        if (r.item_name) itemSet.add(r.item_name);
        if (r.location) locSet.add(r.location);
      });
      setItems(Array.from(itemSet));
      setLocations(Array.from(locSet));
    }
    setLoading(false);
  }, [periodMonth, periodYear, toast]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const countMap = useMemo(() => {
    const map = new Map<string, number | null>();
    records.forEach((r) => {
      map.set(`${r.item_name}|${r.location}`, r.count);
    });
    return map;
  }, [records]);

  function getCount(item: string, location: string): number | null {
    return countMap.get(`${item}|${location}`) ?? null;
  }

  function startEditCell(item: string, location: string) {
    setEditingCell(`${item}|${location}`);
    const val = getCount(item, location);
    setEditValue(val === null ? '' : String(val));
  }

  async function saveCell(item: string, location: string) {
    if (!user) return;
    const newCount: number | null = editValue.trim() === '' ? null : parseInt(editValue);
    if (newCount !== null && isNaN(newCount)) {
      toast({ title: 'Invalid', description: 'Masukkan angka yang valid.', variant: 'destructive' });
      return;
    }
    const existing = records.find((r) => r.item_name === item && r.location === location);
    if (existing) {
      const { error } = await supabase
        .from('inventory_aset_area')
        .update({ count: newCount })
        .eq('id', existing.id);
      if (error) {
        toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const { error } = await supabase.from('inventory_aset_area').insert({
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
    toast({ title: 'Tersimpan', description: `${item} @ ${location}: ${newCount === null ? 'kosong' : newCount}` });
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

  function handleAddLocation() {
    if (!newLocationName.trim()) return;
    if (locations.includes(newLocationName.trim())) {
      toast({ title: 'Sudah ada', description: 'Location sudah ada di list.', variant: 'destructive' });
      return;
    }
    setLocations([...locations, newLocationName.trim()]);
    toast({ title: 'Location ditambah', description: newLocationName });
    setNewLocationName('');
    setAddLocationOpen(false);
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
        toast({ title: 'Tidak ada project', description: 'Buat minimal 1 project di Special Cleaning dulu.', variant: 'destructive' });
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
          type: 'aset-area',
        }),
      });
      const data: SyncResult = await res.json();
      setLastSync(data);
      if (data.success) {
        toast({ title: 'Synced to Sheet', description: `${data.cellsWritten} cells → "${data.sheetName}"` });
      } else {
        toast({ title: 'Sync gagal', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      setLastSync({ success: false, error: e.message });
      toast({ title: 'Sync gagal', description: e.message, variant: 'destructive' });
    }
    setSyncing(false);
  }

  const totalRecords = records.length;
  const totalItems = items.length;
  const totalLocations = locations.length;
  const totalStock = records.reduce((sum, r) => sum + (r.count ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Aset Area"
        description="Track aset area umum: Stella matic, Sofa, Cushion, dll untuk lobby, restaurant, toilet, ballroom."
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
              <Button variant="outline" size="sm" onClick={() => setAddLocationOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Location
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
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
            <Card className="card-shadow-lg">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                  <Building2 className={`h-5 w-5 ${stat.color}`} />
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
        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${lastSync.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <Sheet className={`h-5 w-5 flex-shrink-0 mt-0.5 ${lastSync.success ? 'text-emerald-600' : 'text-red-600'}`} />
          <div className="flex-1">
            {lastSync.success ? (
              <>
                <p className="font-medium text-emerald-900">Synced! {lastSync.cellsWritten} cells written to sheet &quot;{lastSync.sheetName}&quot;</p>
                {lastSync.spreadsheetUrl && (
                  <a href={lastSync.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline">
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
          <select value={periodMonth} onChange={(e) => setPeriodMonth(parseInt(e.target.value))} className="rounded-md border bg-background px-3 py-1.5 text-sm">
            {MONTH_NAMES.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
          </select>
          <Input type="number" value={periodYear} onChange={(e) => setPeriodYear(parseInt(e.target.value) || new Date().getFullYear())} className="h-8 w-24" />
          <span className="ml-auto text-xs text-muted-foreground">{records.length} records for this period</span>
        </CardContent>
      </Card>

      {/* Matrix table */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr>
                  <th className="min-w-[40px] border-r px-3 py-2 text-left font-medium">No</th>
                  <th className="min-w-[180px] border-r px-3 py-2 text-left font-medium">Item</th>
                  {locations.map((loc) => (
                    <th key={loc} className="min-w-[90px] border-r px-2 py-2 text-center font-medium" title={loc}>{loc}</th>
                  ))}
                  <th className="min-w-[70px] px-2 py-2 text-center font-medium bg-gold/10">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i} className="border-b"><td colSpan={locations.length + 3} className="px-3 py-2"><div className="h-6 animate-pulse rounded bg-muted/50" /></td></tr>
                  ))
                ) : items.length === 0 ? (
                  <tr><td colSpan={locations.length + 3} className="px-3 py-8 text-center text-muted-foreground">No items yet. Click &quot;Item&quot; to add aset area items.</td></tr>
                ) : (
                  items.map((item, itemIdx) => {
                    const rowTotal = locations.reduce((sum, loc) => sum + (getCount(item, loc) ?? 0), 0);
                    return (
                      <tr key={item} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="border-r px-3 py-1.5 text-xs text-muted-foreground">{itemIdx + 1}</td>
                        <td className="border-r px-3 py-1.5 font-medium">{item}</td>
                        {locations.map((loc) => {
                          const cellKey = `${item}|${loc}`;
                          const isEditing = editingCell === cellKey;
                          const count = getCount(item, loc);
                          return (
                            <td key={loc} className="border-r px-1 py-1 text-center" onClick={() => canEdit && !isEditing && startEditCell(item, loc)}>
                              {isEditing ? (
                                <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => saveCell(item, loc)} onKeyDown={(e) => { if (e.key === 'Enter') saveCell(item, loc); if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); } }} autoFocus placeholder="—" className="h-7 w-16 rounded border border-gold bg-background px-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
                              ) : (
                                <span className={`inline-block h-7 w-16 rounded ${canEdit ? 'cursor-pointer hover:bg-gold/10' : ''} ${count === null || count === undefined ? 'text-muted-foreground/40' : 'font-medium text-foreground'}`} title={canEdit ? 'Click to edit' : ''}>
                                  {count === null || count === undefined ? '—' : count}
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
        <p className="text-center text-sm text-muted-foreground">View-only access. Switch to admin or supervisor to edit inventory.</p>
      )}

      {/* Help card */}
      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <p className="mb-2 flex items-center gap-2 font-medium text-foreground"><Settings className="h-4 w-4" />How to use</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Matrix ini track aset untuk <strong>area umum</strong> (lobby, restaurant, toilet, ballroom, dll).</li>
            <li>Klik cell untuk edit count. Tekan <strong>Enter</strong> untuk simpan, <strong>Esc</strong> untuk batal.</li>
            <li>Cell kosong (—) artinya belum diisi. <strong>Bukan 0</strong> — biarkan kosong kalau memang tidak ada data.</li>
            <li>Row &quot;Total&quot; di kanan otomatis sum semua location di row itu.</li>
            <li>Untuk aset kamar (TV, AC, dll), buka menu <strong>Inventory Aset Room</strong>.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Add Item dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Aset Area Item</DialogTitle><DialogDescription>Tambah jenis aset area baru (e.g. Table Lamp, Floor Mat).</DialogDescription></DialogHeader>
          <Input placeholder="e.g. Table Lamp" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }} />
          <DialogFooter><Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button><Button onClick={handleAddItem} disabled={!newItemName.trim()} className="gold-gradient text-navy hover:opacity-90">Add Item</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location dialog */}
      <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Area Location</DialogTitle><DialogDescription>Tambah area location baru (e.g. Meeting Room, Pool Area).</DialogDescription></DialogHeader>
          <Input placeholder="e.g. Meeting Room" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddLocation(); }} />
          <DialogFooter><Button variant="outline" onClick={() => setAddLocationOpen(false)}>Cancel</Button><Button onClick={handleAddLocation} disabled={!newLocationName.trim()} className="gold-gradient text-navy hover:opacity-90">Add Location</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
