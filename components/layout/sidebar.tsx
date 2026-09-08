'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Sparkles,
  ClipboardCheck,
  Users,
  DoorOpen,
  FileBarChart,
  Hotel,
  X,
  ListChecks,
  Upload,
  Sheet,
} from 'lucide-react';
import type { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'supervisor'] },
  { label: 'General Cleaning', href: '/general-cleaning', icon: ClipboardCheck, roles: ['admin', 'manager', 'supervisor'] },
  { label: 'Special Cleaning', href: '/special-cleaning', icon: Sparkles, roles: ['admin', 'manager', 'supervisor'] },
  { label: 'Room Management', href: '/rooms', icon: DoorOpen, roles: ['admin'] },
  { label: 'Import Rooms', href: '/import-rooms', icon: Upload, roles: ['admin'] },
  { label: 'Inspection Areas', href: '/inspection-areas', icon: ListChecks, roles: ['admin'] },
  { label: 'User Management', href: '/users', icon: Users, roles: ['admin'] },
  { label: 'Google Sync', href: '/google-sync', icon: Sheet, roles: ['admin'] },
  { label: 'Reports', href: '/reports', icon: FileBarChart, roles: ['admin', 'manager'] },
];

interface SidebarProps {
  role: UserRole;
  pathname: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ role, pathname, mobileOpen, onCloseMobile }: SidebarProps) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'navy-gradient sidebar-shadow fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gold-gradient">
              <Hotel className="h-5 w-5 text-navy" />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold text-white leading-tight">Housekeeping</h1>
              <p className="text-xs text-white/50">Manager</p>
            </div>
          </Link>
          <button
            onClick={onCloseMobile}
            className="text-white/60 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-white/30">Menu</p>
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gold"
                  />
                )}
                <Icon className={cn('h-5 w-5 transition-colors', active ? 'text-gold' : 'text-white/50 group-hover:text-white/80')} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full gold-gradient">
              <span className="text-xs font-bold text-navy uppercase">
                {role.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize text-white">{role}</p>
              <p className="text-xs text-white/40">Access Level</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
