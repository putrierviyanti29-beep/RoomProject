'use client';

import { BedDouble } from 'lucide-react';
import { InventoryPlaceholder } from '@/components/inventory/inventory-placeholder';

export default function InventoryLinenPage() {
  return (
    <InventoryPlaceholder
      title="Inventory Linen"
      description="Track linen items: bed sheets, pillow cases, towels, bath mats, duvet covers, dll. Stock in/out, condition tracking, dan sync ke Google Sheets."
      icon={BedDouble}
      examples={['Bed Sheet King', 'Pillow Case', 'Bath Towel', 'Hand Towel', 'Bath Mat', 'Duvet Cover']}
      features={[
        'Tambah/edit/hapus linen items',
        'Stock in (penerimaan) & stock out (pengeluaran)',
        'Track kondisi (baru, layak pakai, perlu cuci, rusak)',
        'Set minimum stock alert',
        'Lihat history per item',
        'Sinkronisasi ke Google Sheets (format custom)',
        'Export laporan bulanan',
      ]}
    />
  );
}
