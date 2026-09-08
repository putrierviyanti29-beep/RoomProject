'use client';

import { motion } from 'framer-motion';
import { Package, Sparkles, ArrowRight, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function InventoryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Track inventory items, stock levels, and usage. Sync to Google Sheets coming soon."
      />

      {/* Coming soon banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="card-shadow-lg border-gold/30 bg-gradient-to-br from-navy/5 to-gold/5">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl gold-gradient">
                <Package className="h-8 w-8 text-navy" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">Inventory Module — Coming Soon</h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Fitur inventory sedang dalam pengembangan. Nanti kamu bisa:
                </p>
              </div>
              <div className="grid gap-2 text-left sm:grid-cols-2">
                {[
                  'Tambah item inventory (nama, kategori, satuan)',
                  'Track stock in / stock out',
                  'Set minimum stock alert',
                  'Lihat history per item',
                  'Sinkronisasi ke Google Sheets (custom format)',
                  'Export CSV / laporan bulanan',
                ].map((feature, i) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
                    className="flex items-start gap-2 rounded-lg border border-gold/20 bg-card p-3 text-sm"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold" />
                    <span>{feature}</span>
                  </motion.div>
                ))}
              </div>
              <Badge variant="outline" className="mt-2 gap-1.5">
                <Settings className="h-3 w-3" />
                Status: Planning Phase
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Discussion card */}
      <Card className="card-shadow-lg">
        <CardContent className="p-6">
          <h3 className="font-display text-lg font-semibold">Next Steps</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Kita akan diskusikan bersama untuk menentukan:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm">
            <li>
              <strong>Struktur inventory</strong> — item fields apa saja yang kamu butuhkan
              (nama, kode, kategori, lokasi, harga, dll.)
            </li>
            <li>
              <strong>Operasi inventory</strong> — stock in, stock out, transfer, adjustment, dll.
            </li>
            <li>
              <strong>Spreadsheet sync format</strong> — kamu bilang ada sedikit perbedaan dengan
              sync cleaning. Kita akan bahas format spesifiknya.
            </li>
            <li>
              <strong>Reporting</strong> — laporan apa yang kamu butuhkan (low stock, usage
              history, value summary, dll.)
            </li>
            <li>
              <strong>Roles &amp; permissions</strong> — siapa yang bisa add/edit/delete items,
              siapa yang bisa stock in/out
            </li>
          </ul>
          <div className="mt-4 rounded-lg bg-muted/30 p-4 text-sm">
            <p className="font-medium">💡 Siapkan info berikut untuk diskusi kita:</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
              <li>Contoh item inventory yang kamu punya (5-10 items)</li>
              <li>Screenshot / contoh spreadsheet inventory yang sudah kamu pakai</li>
              <li>Alur kerja: bagaimana stock in/out dicatat saat ini</li>
              <li>Siapa yang akan pakai modul ini (admin saja / semua role)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card className="card-shadow-lg bg-muted/30">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="font-medium">Siap mulai diskusi inventory?</p>
            <p className="text-sm text-muted-foreground">
              Kirim contoh data inventory & struktur spreadsheet yang kamu mau, nanti saya bikinkan
              module-nya.
            </p>
          </div>
          <Button className="gold-gradient text-navy hover:opacity-90" disabled>
            <ArrowRight className="mr-2 h-4 w-4" />
            Mulai Diskusi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
