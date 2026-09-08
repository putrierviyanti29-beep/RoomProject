'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant?: 'default' | 'gold' | 'navy' | 'success' | 'warning';
  delay?: number;
  sublabel?: string;
}

const variantStyles = {
  default: 'bg-card text-foreground border-border',
  gold: 'gold-gradient text-navy border-transparent',
  navy: 'navy-gradient text-white border-transparent',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
};

const iconBgStyles = {
  default: 'bg-muted text-muted-foreground',
  gold: 'bg-navy/10 text-navy',
  navy: 'bg-white/10 text-gold',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
};

export function StatCard({ label, value, icon: Icon, variant = 'default', delay = 0, sublabel }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className={cn('card-shadow-lg overflow-hidden transition-all hover:scale-[1.02]', variantStyles[variant])}>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className={cn('text-sm font-medium', variant === 'default' ? 'text-muted-foreground' : 'opacity-70')}>
              {label}
            </p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
            {sublabel && (
              <p className={cn('mt-1 text-xs', variant === 'default' ? 'text-muted-foreground' : 'opacity-60')}>
                {sublabel}
              </p>
            )}
          </div>
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', iconBgStyles[variant])}>
            <Icon className="h-6 w-6" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
