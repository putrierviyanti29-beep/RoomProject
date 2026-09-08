'use client';

import { Armchair } from 'lucide-react';
import { InventoryPlaceholder } from '@/components/inventory/inventory-placeholder';

export default function InventoryAsetRoomPage() {
  return (
    <InventoryPlaceholder
      title="Inventory Aset Room"
      description="Track aset tetap per kamar: furniture, elektronik, fixture, dll. Setiap aset terhubung ke nomor kamar tertentu."
      icon={Armchair}
      examples={['Spring Bed', 'Wardrobe', 'TV 32 inch', 'AC Split', 'Meja Kerja', 'Kursi', 'Lampu Tidur']}
      features={[
        'Tambah/edit/hapus aset per kamar',
        'Setiap aset terhubung ke room number (301, 302, ...)',
        'Track kondisi (baik, perlu service, rusak)',
        'Tanggal pembelian & tanggal service terakhir',
        'Photo aset (upload ke Supabase Storage)',
        'History perpindahan aset antar kamar',
        'Sinkronisasi ke Google Sheets (format custom)',
        'Export laporan aset per kamar / per section',
      ]}
    />
  );
}
