'use client';

import { Wrench } from 'lucide-react';
import { InventoryPlaceholder } from '@/components/inventory/inventory-placeholder';

export default function InventoryEquipmentPage() {
  return (
    <InventoryPlaceholder
      title="Inventory Equipment Room & Area"
      description="Track equipment maintenance per kamar & area umum: pompa, motor, panel listrik, hydrant, dll. Schedule maintenance & log service."
      icon={Wrench}
      examples={['Water Pump', 'AC Motor', 'Electrical Panel', 'Fire Extinguisher', 'Hydrant', 'Generator', 'Elevator Motor']}
      features={[
        'Tambah/edit/hapus equipment',
        'Setiap equipment terhubung ke room atau area (lobby, corridor, dll.)',
        'Track kondisi (running, perlu service, breakdown)',
        'Schedule maintenance berkala (weekly, monthly, quarterly)',
        'Log service history (tanggal, technician, parts replaced)',
        'Upload foto equipment & service report',
        'Alert untuk equipment yang overdue service',
        'Sinkronisasi ke Google Sheets (format custom)',
        'Export laporan maintenance per equipment / per area',
      ]}
    />
  );
}
