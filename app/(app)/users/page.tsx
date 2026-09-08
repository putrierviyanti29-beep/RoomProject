'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Shield,
  Mail,
  Crown,
  Eye,
  ClipboardCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UserRole } from '@/lib/types';

interface UserRow {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
  email: string;
}

const ROLE_META: Record<UserRole, { label: string; icon: typeof Crown; color: string; bg: string }> = {
  admin: { label: 'Admin', icon: Crown, color: 'text-gold', bg: 'bg-amber-50' },
  manager: { label: 'Manager', icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50' },
  supervisor: { label: 'Supervisor', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

export default function UsersPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, role, created_at')
      .order('created_at', { ascending: false });

    if (!profiles) {
      setLoading(false);
      return;
    }

    // We need to get emails from auth - but we can't query auth.users from the client.
    // Instead, we'll use the profiles table which has the info we need.
    // For the current user, we have their email from the auth context.
    const rows: UserRow[] = profiles.map((p) => ({
      id: p.id,
      name: p.name || 'Unknown',
      role: p.role,
      created_at: p.created_at,
      email: p.id === profile?.id ? profile.email : '—',
    }));

    setUsers(rows);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    fetchUsers();
  }, [profile, router, fetchUsers]);

  if (profile && profile.role !== 'admin') {
    return null;
  }

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const managerCount = users.filter((u) => u.role === 'manager').length;
  const supervisorCount = users.filter((u) => u.role === 'supervisor').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="View and manage system users and their roles."
      />

      {/* Role distribution */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { role: 'admin' as UserRole, count: adminCount },
          { role: 'manager' as UserRole, count: managerCount },
          { role: 'supervisor' as UserRole, count: supervisorCount },
        ].map((stat, i) => {
          const meta = ROLE_META[stat.role];
          const Icon = meta.icon;
          return (
            <motion.div
              key={stat.role}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
            >
              <Card className="card-shadow-lg">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${meta.bg}`}>
                    <Icon className={`h-6 w-6 ${meta.color}`} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold">{stat.count}</p>
                    <p className="text-sm text-muted-foreground">{meta.label}s</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Users table */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const meta = ROLE_META[user.role];
                    const Icon = meta.icon;
                    const initials = user.name
                      .split(' ')
                      .map((w) => w.charAt(0))
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className={`text-xs font-bold ${meta.bg} ${meta.color}`}>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            {user.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${meta.bg} ${meta.color} border-transparent hover:opacity-80`}>
                            <Icon className="mr-1 h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="card-shadow-lg border-amber-200 bg-amber-50/30">
        <CardContent className="flex items-start gap-3 p-5">
          <Shield className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium">Role Management</p>
            <p className="mt-1 text-sm text-muted-foreground">
              User roles are assigned during account creation. To change a user's role,
              have them create a new account with the desired role, or contact your database administrator.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
