'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface DashboardStats {
  totalRooms: number;
  completedToday: number;
  remainingToday: number;
  dailyProgress: number;
  specialProjects: number;
  specialCompleted: number;
  specialTotal: number;
  specialProgress: number;
  monthlyData: { date: string; completed: number; total: number }[];
  recentActivity: { id: string; room_number: string; completed_by: string; completed_at: string }[];
  loading: boolean;
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRooms: 0,
    completedToday: 0,
    remainingToday: 0,
    dailyProgress: 0,
    specialProjects: 0,
    specialCompleted: 0,
    specialTotal: 0,
    specialProgress: 0,
    monthlyData: [],
    recentActivity: [],
    loading: true,
  });

  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [roomsRes, gcTodayRes, gcRecentRes, spRes, scRes] = await Promise.all([
      supabase.from('rooms').select('id', { count: 'exact', head: true }),
      supabase.from('general_cleaning').select('id, status').eq('date', today),
      supabase
        .from('general_cleaning')
        .select('id, completed_at, completed_by, rooms!inner(room_number), profiles!inner(name)')
        .eq('status', 'done')
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase.from('special_projects').select('id, project_name, month, year'),
      supabase.from('special_checklists').select('id, status, project_id'),
    ]);

    const totalRooms = roomsRes.count ?? 0;
    const gcToday = gcTodayRes.data ?? [];
    const completedToday = gcToday.filter((g) => g.status === 'done').length;
    const remainingToday = gcToday.filter((g) => g.status === 'pending').length;
    const dailyProgress = gcToday.length > 0 ? Math.round((completedToday / gcToday.length) * 100) : 0;

    const specialProjects = spRes.data ?? [];
    const specialChecklists = scRes.data ?? [];
    const specialCompleted = specialChecklists.filter((s) => s.status === 'done').length;
    const specialTotal = specialChecklists.length;
    const specialProgress = specialTotal > 0 ? Math.round((specialCompleted / specialTotal) * 100) : 0;

    // Monthly data: last 7 days
    const monthlyData: { date: string; completed: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayRecords = gcToday.filter((g) => g.date === dateStr || (i === 0));
      monthlyData.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        completed: i === 0 ? completedToday : 0,
        total: i === 0 ? gcToday.length : 0,
      });
    }

    const recentActivity = (gcRecentRes.data ?? []).map((item) => ({
      id: item.id,
      room_number: item.rooms?.room_number ?? '—',
      completed_by: item.profiles?.name ?? 'Unknown',
      completed_at: item.completed_at ?? '',
    }));

    setStats({
      totalRooms,
      completedToday,
      remainingToday,
      dailyProgress,
      specialProjects: specialProjects.length,
      specialCompleted,
      specialTotal,
      specialProgress,
      monthlyData,
      recentActivity,
      loading: false,
    });
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, refresh: fetchStats };
}
