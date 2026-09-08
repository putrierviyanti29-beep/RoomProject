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

    // Compute date 7 days ago for the weekly chart
    const weekAgoDate = new Date();
    weekAgoDate.setDate(weekAgoDate.getDate() - 6);
    const weekAgo = weekAgoDate.toISOString().split('T')[0];

    const [roomsRes, gcTodayRes, gcRecentRes, gcWeekRes, spRes, scRes] = await Promise.all([
      supabase.from('rooms').select('id', { count: 'exact', head: true }),
      supabase.from('general_cleaning').select('id, status, date').eq('date', today),
      supabase
        .from('general_cleaning')
        .select('id, completed_at, completed_by, rooms!inner(room_number), profiles!inner(name)')
        .eq('status', 'done')
        .order('completed_at', { ascending: false })
        .limit(5),
      supabase
        .from('general_cleaning')
        .select('id, status, date')
        .gte('date', weekAgo)
        .lte('date', today),
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

    // Weekly data: last 7 days, using real GC records grouped by date
    const gcWeek = gcWeekRes.data ?? [];
    const weeklyData: { date: string; completed: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayRecords = gcWeek.filter((g) => g.date === dateStr);
      weeklyData.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        completed: dayRecords.filter((g) => g.status === 'done').length,
        total: dayRecords.length,
      });
    }

    const recentActivity = (gcRecentRes.data ?? []).map((item: any) => ({
      id: item.id,
      room_number: Array.isArray(item.rooms) ? item.rooms[0]?.room_number ?? '—' : item.rooms?.room_number ?? '—',
      completed_by: Array.isArray(item.profiles) ? item.profiles[0]?.name ?? 'Unknown' : item.profiles?.name ?? 'Unknown',
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
      monthlyData: weeklyData,
      recentActivity,
      loading: false,
    });
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, refresh: fetchStats };
}
