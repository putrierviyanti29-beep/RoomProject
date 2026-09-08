'use client';

import { motion } from 'framer-motion';
import { Sparkles, Settings, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface InventoryPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Examples of items this inventory will track (shown as chips) */
  examples: string[];
  /** Planned features list */
  features: string[];
}

export function InventoryPlaceholder({
  title,
  description,
  icon: Icon,
  examples,
  features,
}: InventoryPlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

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
                <Icon className="h-8 w-8 text-navy" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">{title} — Coming Soon</h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
              </div>

              {/* Example items */}
              {examples.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Contoh item:</span>
                  {examples.map((ex) => (
                    <Badge key={ex} variant="outline" className="bg-card text-xs">
                      {ex}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Feature list */}
              <div className="grid w-full gap-2 text-left sm:grid-cols-2">
                {features.map((feature, i) => (
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
          <h3 className="font-display text-lg font-semibold">Siap untuk diskusi</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Kirim saya info berikut untuk {title}:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm">
            <li>Contoh item {title.toLowerCase()} yang kamu punya (5-10 items)</li>
            <li>Screenshot / contoh spreadsheet {title.toLowerCase()} yang sudah kamu pakai</li>
            <li>Alur kerja: bagaimana stock in/out dicatat saat ini</li>
            <li>Field apa saja yang kamu butuhkan per item (kode, satuan, lokasi, harga, dll.)</li>
            <li>Aturan spreadsheet sync yang berbeda dari cleaning — apa bedanya?</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
