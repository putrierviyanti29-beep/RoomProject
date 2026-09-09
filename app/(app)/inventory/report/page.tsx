'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  FileBarChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Package,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type InventoryType = 'linen' | 'aset-room' | 'aset-area' | 'equipment';

interface ItemComparison {
  item_name: string;
  last_month: number;
  this_month: number;
  difference: number;
  ooo: number;
  lost: number;
  status: 'normal' | 'minus' | 'ooo' | 'lost';
}

export default function InventoryReportPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inventoryType, setInventoryType] = useState<InventoryType>('linen');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [comparisons, setComparisons] = useState<ItemComparison[]>([]);

  const canView = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'supervisor';

  // Calculate last month (handle year wrap)
  const lastMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const lastMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  const tableName = useMemo(() => {
    switch (inventoryType) {
      case 'linen': return 'inventory_linen';
      case 'aset-room': return 'inventory_aset_room';
      case 'aset-area': return 'inventory_aset_area';
      case 'equipment': return 'inventory_equipment';
      default: return 'inventory_linen';
    }
  }, [inventoryType]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      // For equipment, structure is different (flat table, not matrix)
      if (inventoryType === 'equipment') {
        const thisMonthRes = await supabase
            .from('inventory_equipment')
            .select('item_name, closing_inventory, condition_broken')
            .order('item_name', { ascending: true });

        if (thisMonthRes.error) throw new Error(thisMonthRes.error.message);

        const thisMonthData = thisMonthRes.data ?? [];
        const comps: ItemComparison[] = thisMonthData.map((item: any) => {
          const thisMonth = item.closing_inventory ?? 0;
          const ooo = item.condition_broken ?? 0;
          const diff = 0; // no last month data for equipment yet
          return {
            item_name: item.item_name,
            last_month: 0,
            this_month: thisMonth,
            difference: diff,
            ooo,
            lost: diff < 0 ? Math.abs(diff) : 0,
            status: ooo > 0 ? 'ooo' : 'normal',
          };
        });
        setComparisons(comps);
      } else {
        // For matrix inventory (linen, aset-room, aset-area)
        // Fetch this month + last month data
        const [thisMonthRes, lastMonthRes] = await Promise.all([
          supabase
            .from(tableName)
            .select('item_name, location, count, ooo_count')
            .eq('period_month', selectedMonth)
            .eq('period_year', selectedYear),
          supabase
            .from(tableName)
            .select('item_name, location, count')
            .eq('period_month', lastMonth)
            .eq('period_year', lastMonthYear),
        ]);

        if (thisMonthRes.error) throw new Error(thisMonthRes.error.message);
        if (lastMonthRes.error) throw new Error(lastMonthRes.error.message);

        // Aggregate by item_name (sum across all locations)
        const thisMonthMap = new Map<string, { count: number; ooo: number }>();
        (thisMonthRes.data ?? []).forEach((r: any) => {
          const existing = thisMonthMap.get(r.item_name) ?? { count: 0, ooo: 0 };
          existing.count += r.count ?? 0;
          existing.ooo += r.ooo_count ?? 0;
          thisMonthMap.set(r.item_name, existing);
        });

        const lastMonthMap = new Map<string, number>();
        (lastMonthRes.data ?? []).forEach((r: any) => {
          const existing = lastMonthMap.get(r.item_name) ?? 0;
          lastMonthMap.set(r.item_name, existing + (r.count ?? 0));
        });

        // Build comparison
        const allItems = new Set<string>([...Array.from(thisMonthMap.keys()), ...Array.from(lastMonthMap.keys())]);
        const comps: ItemComparison[] = Array.from(allItems).map((itemName) => {
          const thisData = thisMonthMap.get(itemName) ?? { count: 0, ooo: 0 };
          const lastVal = lastMonthMap.get(itemName) ?? 0;
          const diff = thisData.count - lastVal;
          let status: ItemComparison['status'] = 'normal';
          if (diff < 0) status = 'minus';
          if (thisData.ooo > 0) status = 'ooo';
          if (diff < 0 && thisData.ooo > 0) status = 'lost';
          return {
            item_name: itemName,
            last_month: lastVal,
            this_month: thisData.count,
            difference: diff,
            ooo: thisData.ooo,
            lost: diff < 0 ? Math.abs(diff) : 0,
            status,
          };
        }).sort((a, b) => a.item_name.localeCompare(b.item_name));

        setComparisons(comps);
      }
    } catch (e: any) {
      console.error('Report error:', e);
      toast({ title: 'Gagal memuat laporan', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [inventoryType, tableName, selectedMonth, selectedYear, lastMonth, lastMonthYear, toast]);

  useEffect(() => {
    if (canView) fetchReport();
  }, [fetchReport, canView]);

  // Summary stats
  const stats = useMemo(() => {
    const totalThisMonth = comparisons.reduce((s, c) => s + c.this_month, 0);
    const totalLastMonth = comparisons.reduce((s, c) => s + c.last_month, 0);
    const totalMinus = comparisons.filter(c => c.difference < 0).reduce((s, c) => s + Math.abs(c.difference), 0);
    const totalOOO = comparisons.reduce((s, c) => s + c.ooo, 0);
    const totalLost = comparisons.reduce((s, c) => s + c.lost, 0);
    const itemsWithMinus = comparisons.filter(c => c.difference < 0).length;
    return { totalThisMonth, totalLastMonth, totalMinus, totalOOO, totalLost, itemsWithMinus };
  }, [comparisons]);

  // Bar chart data (top 15 items with biggest differences, or all if < 15)
  const chartData = useMemo(() => {
    return comparisons
      .slice()
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 15)
      .map(c => ({
        name: c.item_name.length > 15 ? c.item_name.substring(0, 13) + '...' : c.item_name,
        fullName: c.item_name,
        'Bulan Lalu': c.last_month,
        'Bulan Ini': c.this_month,
        selisih: c.difference,
      }));
  }, [comparisons]);

  function exportCSV() {
    if (comparisons.length === 0) return;
    const headers = ['Item', `Bulan Lalu (${MONTH_NAMES[lastMonth-1]} ${lastMonthYear})`, `Bulan Ini (${MONTH_NAMES[selectedMonth-1]} ${selectedYear})`, 'Selisih', 'OOO', 'Lost/Hilang', 'Status'];
    const rows = comparisons.map(c => [
      c.item_name,
      c.last_month,
      c.this_month,
      c.difference,
      c.ooo,
      c.lost,
      c.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory-report-${inventoryType}-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: 'Export complete', description: `${comparisons.length} items exported to CSV.` });
  }

  if (!canView) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Access denied. Admin, manager, or supervisor only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Report"
        description="Laporan perbandingan stock bulan lalu vs bulan ini. Deteksi kehilangan/minus, OOO, dan lost."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={comparisons.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="card-shadow-lg">
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div>
            <label className="text-xs text-muted-foreground">Inventory Type</label>
            <select
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value as InventoryType)}
              className="ml-2 rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              <option value="linen">Inventory Linen</option>
              <option value="aset-room">Inventory Aset Room</option>
              <option value="aset-area">Inventory Aset Area</option>
              <option value="equipment">Inventory Equipment</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Bulan</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="ml-2 rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tahun</label>
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="ml-2 w-20 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <Badge variant="outline" className="ml-auto">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear} vs {MONTH_NAMES[lastMonth - 1]} {lastMonthYear}
          </Badge>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: `Total Stock ${MONTH_NAMES[selectedMonth-1]}`, value: stats.totalThisMonth, icon: Package, color: 'text-navy', bg: 'bg-muted' },
          { label: `Total Stock ${MONTH_NAMES[lastMonth-1]}`, value: stats.totalLastMonth, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Minus/Kehilangan', value: stats.totalMinus, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'OOO (Out Of Order)', value: stats.totalOOO, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Lost/Hilang', value: stats.totalLost, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
              <Card className="card-shadow-lg">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Bar chart */}
      <Card className="card-shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileBarChart className="h-5 w-5" />
            Perbandingan Stock: {MONTH_NAMES[lastMonth-1]} {lastMonthYear} vs {MONTH_NAMES[selectedMonth-1]} {selectedYear}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Top 15 items dengan selisih terbesar. Bar merah = minus/kehilangan.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-80 animate-pulse rounded-lg bg-muted/50" />
          ) : chartData.length === 0 ? (
            <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
              No data available for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 10%, 90%)" />
                <XAxis
                  dataKey="name"
                  stroke="hsl(215, 16%, 47%)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis stroke="hsl(215, 16%, 47%)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(40, 10%, 88%)',
                    background: 'hsl(0, 0%, 100%)',
                    fontSize: '13px',
                  }}
                  formatter={(value: any, name: any) => [value, name]}
                  labelFormatter={(label: any) => {
                    const item = chartData.find(d => d.name === label);
                    return item?.fullName ?? label;
                  }}
                />
                <Legend />
                <Bar dataKey="Bulan Lalu" fill="hsl(215, 16%, 65%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Bulan Ini" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.selisih < 0 ? 'hsl(0, 72%, 51%)' : 'hsl(43, 74%, 50%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card className="card-shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Detail Per Item</CardTitle>
          <p className="text-sm text-muted-foreground">
            {comparisons.length} items. Items dengan selisih minus dihighlight merah.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>No</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">{MONTH_NAMES[lastMonth-1]} {lastMonthYear}</TableHead>
                  <TableHead className="text-right">{MONTH_NAMES[selectedMonth-1]} {selectedYear}</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead className="text-right">OOO</TableHead>
                  <TableHead className="text-right">Lost/Hilang</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : comparisons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No data for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  comparisons.map((c, i) => (
                    <TableRow
                      key={c.item_name}
                      className={c.difference < 0 ? 'bg-red-50/40' : c.ooo > 0 ? 'bg-amber-50/40' : ''}
                    >
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.item_name}</TableCell>
                      <TableCell className="text-right text-sm">{c.last_month}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{c.this_month}</TableCell>
                      <TableCell className={`text-right text-sm font-bold ${c.difference < 0 ? 'text-red-600' : c.difference > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {c.difference > 0 ? '+' : ''}{c.difference}
                      </TableCell>
                      <TableCell className="text-right text-sm text-amber-600">{c.ooo > 0 ? c.ooo : '—'}</TableCell>
                      <TableCell className="text-right text-sm text-red-600">{c.lost > 0 ? c.lost : '—'}</TableCell>
                      <TableCell>
                        {c.difference < 0 && c.ooo > 0 ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Lost + OOO</Badge>
                        ) : c.difference < 0 ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Minus</Badge>
                        ) : c.ooo > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">OOO</Badge>
                        ) : c.difference > 0 ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">+</Badge>
                        ) : (
                          <Badge variant="outline">Normal</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
